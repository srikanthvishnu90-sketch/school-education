import {
  computeSkillCalibration,
  createEvidence,
  createSkillTag,
  type SkillTag,
} from "@/domain/intelligence/calibrationModel";
import { readSelfConfidence } from "@/domain/intelligence/metacognition";
import type { ReflectionSession } from "@/domain/intelligence/session";
import type {
  CalibrationRecordRepository,
  EvidenceRepository,
  LessonRepository,
  SkillTagRepository,
} from "@/domain/ports/intelligenceRepositories";

/**
 * Runtime glue for the SKILL-TAG calibration model (brief §2). A teacher score and
 * the student's single in-chat self-confidence are fanned out across every skill the
 * lesson tagged, producing per-skill Evidence + CalibrationRecords. The tags are
 * derived server-side from the lesson and are invisible to the student — this adds no
 * step and no friction to the reflection UX. Everything the MATH here relies on lives
 * in the pure domain (calibrationModel + metacognition); this file only fetches,
 * persists, and owns the deterministic id scheme.
 *
 * Idempotent: every write is keyed by a derived id, so re-scoring overwrites in place
 * rather than duplicating. A missing session or lesson is a safe no-op.
 */

/**
 * The slice of the world this helper touches. Kept structural (not the full `World`)
 * so the demo seed — which holds only the intel repos and a clock — can call it too.
 */
export interface CalibrationWorld {
  intel: {
    lessons: Pick<LessonRepository, "findById">;
    skillTags: Pick<SkillTagRepository, "listByClass" | "save">;
    evidence: Pick<EvidenceRepository, "save">;
    calibrationRecords: Pick<CalibrationRecordRepository, "save">;
  };
  clock: { now(): Date };
}

export interface SyncSkillCalibrationInput {
  /** The lesson id (== reflectionId) the score belongs to. */
  reflectionId: string;
  studentId: string;
  /** The lesson's class — the scope skill tags are get-or-created in. */
  classId: string;
  /** The teacher-entered result as a percent (0..100). */
  scorePercent: number;
  /** The student's completed reflection, whose self-confidence is read. Null → no-op. */
  session: ReflectionSession | null;
}

/** Deterministic, url-safe token for a skill-tag id (mirrors teacherReflectionActions). */
function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Fan a reflection's score + self-confidence out across every skill its lesson tags,
 * persisting Evidence and one CalibrationRecord per skill. Get-or-creates the skill
 * tags for the class, so a second student on the same lesson REUSES them. Safe to call
 * repeatedly — re-scoring overwrites by id.
 */
export async function syncSkillCalibration(
  world: CalibrationWorld,
  input: SyncSkillCalibrationInput,
): Promise<void> {
  const { reflectionId, studentId, classId, scorePercent, session } = input;
  if (session === null) return;
  const lesson = await world.intel.lessons.findById(reflectionId);
  if (lesson === null) return;

  // Skill labels come from the lesson deterministically: its objectives, or its title
  // when there are none. Trimmed, de-duplicated, empties dropped.
  const source = lesson.objectives.length > 0 ? lesson.objectives : [lesson.title];
  const labels: string[] = [];
  const seenLabel = new Set<string>();
  for (const raw of source) {
    const label = raw.trim();
    if (label.length === 0) continue;
    if (seenLabel.has(label)) continue;
    seenLabel.add(label);
    labels.push(label);
  }
  if (labels.length === 0) return;

  // Get-or-create a SkillTag per label in the class, so re-scores and other students
  // reuse the same tags rather than minting duplicates.
  const existing = await world.intel.skillTags.listByClass(classId);
  const byLabel = new Map<string, SkillTag>();
  for (const tag of existing) byLabel.set(tag.label, tag);
  const skillIds: string[] = [];
  for (const label of labels) {
    let tag = byLabel.get(label);
    if (tag === undefined) {
      tag = createSkillTag({
        id: `skill-${classId}-${slug(label)}`,
        classId,
        label,
        source: "ai_extracted",
      });
      await world.intel.skillTags.save(tag);
      byLabel.set(label, tag);
    }
    skillIds.push(tag.id);
  }

  // One Evidence per skill — the raw graded datum, out of 100.
  for (const skillId of skillIds) {
    await world.intel.evidence.save(
      createEvidence({
        id: `ev-${reflectionId}-${studentId}-${skillId}`,
        studentId,
        lessonId: reflectionId,
        skillId,
        kind: "score",
        value: scorePercent,
        maxValue: 100,
      }),
    );
  }

  // Per-skill calibration: the single claimed confidence + single demonstrated fraction
  // applied to every tagged skill. With no readable confidence the domain yields no
  // records (nothing to save) — Evidence still stands on its own.
  const claimedConfidence = readSelfConfidence(session);
  const records = computeSkillCalibration({
    studentId,
    lessonId: reflectionId,
    skillIds,
    claimedConfidence,
    demonstrated: scorePercent / 100,
    idFor: (skillId) => `cal-${reflectionId}-${studentId}-${skillId}`,
    computedAt: world.clock.now(),
  });
  for (const record of records) {
    await world.intel.calibrationRecords.save(record);
  }
}
