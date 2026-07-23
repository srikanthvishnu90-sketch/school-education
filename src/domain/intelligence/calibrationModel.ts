import { type Id } from "../common";
import {
  calibrationRecordSchema,
  evidenceSchema,
  skillTagSchema,
} from "../schemas/intelligence";
import type { LessonAnalysis } from "./lesson";

/**
 * The SKILL-TAG calibration model (brief §2). A lesson exercises one or more
 * skills (learning-map tags); a student's single reflection carries one self-claimed
 * confidence and, once graded, one demonstrated score. We attach BOTH to every skill
 * the lesson tagged, producing a per-skill calibration record. That per-skill read is
 * what later lets a student locate themselves on the learning map and see WHERE their
 * self-judgment ran ahead of (or behind) the work — never a grade, never red/green
 * (CLAUDE.md → congruence is a flag, feedback is task-focused).
 *
 * Pure domain: deterministic math only, no adapter/UI/model imports.
 */

/** Whether a skill tag was drafted by the AI or corrected by a teacher. */
export type SkillTagSource = "ai_extracted" | "teacher_edited";

/**
 * A skill (learning-map tag) a lesson exercises. Named `SkillTag` to avoid clashing
 * with the pre-existing academic `Skill` (src/domain/skill.ts, a different shape);
 * this is the tag layer of the skill-tag calibration variant (brief §2).
 */
export interface SkillTag {
  id: Id;
  classId: Id;
  label: string;
  source: SkillTagSource;
  standardRef?: string;
}

/** What a piece of evidence is: a numeric score, an exit answer, or a work sample. */
export type EvidenceKind = "score" | "exit_answer" | "work_sample";

/** A raw graded/observed datum tied to one student, lesson, and skill. */
export interface Evidence {
  id: Id;
  studentId: Id;
  lessonId: Id;
  skillId: Id;
  kind: EvidenceKind;
  value: number | string;
  maxValue?: number;
}

/** One student's self-claim on a skill set beside what they demonstrated on it. */
export interface CalibrationRecord {
  id: Id;
  studentId: Id;
  skillId: Id;
  lessonId: Id;
  /** Self-reported confidence in [0, 1]. A record always has a claim. */
  claimedConfidence: number;
  /** Fraction demonstrated in [0, 1], or null while the work is ungraded. */
  demonstrated: number | null;
  /** Signed gap (claim − demonstrated), or null when ungraded. Not a verdict. */
  delta: number | null;
  computedAt: Date;
}

export function createSkillTag(input: SkillTag): SkillTag {
  return Object.freeze(skillTagSchema.parse(input));
}

export function createEvidence(input: Evidence): Evidence {
  return Object.freeze(evidenceSchema.parse(input));
}

export function createCalibrationRecord(
  input: CalibrationRecord,
): CalibrationRecord {
  return Object.freeze(calibrationRecordSchema.parse(input));
}

/**
 * Deterministic skill extraction for the tag layer: a lesson's `objectives` are the
 * skills; if it has none, the single `topic` stands in as the one tag. Trimmed,
 * de-duplicated, empties dropped, order preserved. This is the tag SOURCE — kept
 * simple and deterministic on purpose (no model decides the tags here).
 */
export function skillLabelsForLesson(analysis: LessonAnalysis): string[] {
  const source =
    analysis.objectives.length > 0 ? analysis.objectives : [analysis.topic];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of source) {
    const label = raw.trim();
    if (label.length === 0) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/**
 * The skill-tag core: apply a reflection's SINGLE self-confidence and SINGLE score to
 * EVERY skill the lesson tagged, producing one CalibrationRecord per skill. A record
 * needs a claim, so when `claimedConfidence` is null we produce nothing (no skill gets
 * a record). While the work is ungraded (`demonstrated` null) the record still exists —
 * the claim is real — but `demonstrated`/`delta` stay null until a grade arrives.
 * `delta = claim − demonstrated` only when both are present. `idFor` builds each
 * record's id from its skillId, so the caller owns the id scheme.
 */
export function computeSkillCalibration(input: {
  studentId: Id;
  lessonId: Id;
  skillIds: Id[];
  claimedConfidence: number | null;
  demonstrated: number | null;
  idFor: (skillId: Id) => Id;
  computedAt: Date;
}): CalibrationRecord[] {
  const { claimedConfidence, demonstrated } = input;
  if (claimedConfidence === null) return [];
  const delta =
    demonstrated !== null ? claimedConfidence - demonstrated : null;
  return input.skillIds.map((skillId) =>
    createCalibrationRecord({
      id: input.idFor(skillId),
      studentId: input.studentId,
      skillId,
      lessonId: input.lessonId,
      claimedConfidence,
      demonstrated,
      delta,
      computedAt: input.computedAt,
    }),
  );
}
