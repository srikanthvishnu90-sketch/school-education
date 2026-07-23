"use server";

import {
  deriveReflectionOutcome,
  metacognitiveTrend,
  readSelfConfidence,
  type MetacognitiveAlignment,
  type ReflectionOutcome,
  type TrendDirection,
} from "@/domain/intelligence/metacognition";
import {
  summariseStudentSkillCalibration,
  type StudentSkillCalibration,
} from "@/domain/intelligence/skillCalibrationView";
import { getSessionStudent } from "./session";
import { getWorld } from "./world";

/**
 * The student's longitudinal view (P7): every reflection they finished, the graded
 * result behind it, and how their self-judgment lined up — plus whether, over time,
 * that judgment is getting closer to their results. Trajectory over a single
 * self-judgment is never asserted (CLAUDE.md → trust trajectory).
 */

export interface TimelineEntry {
  reflectionId: string;
  title: string;
  /** The one practical next step the student chose (Stage 6), when they named one. */
  selectedAction?: string;
  /** 0..100, or null when no teacher score has been recorded for this reflection yet. */
  scorePercent: number | null;
  /** 0..100, present only once graded; null when the reflection had no confidence answer. */
  selfConfidencePercent: number | null;
  /** Present only once graded; null when there was no self-confidence to compare against. */
  alignment: MetacognitiveAlignment | null;
  /** ISO time this reflection became a "day" — when the student completed it. */
  recordedAt: string;
}

export interface StudentTimeline {
  entries: TimelineEntry[];
  trend: TrendDirection;
  /**
   * Per-skill calibration: for each skill this student has been graded on, how their
   * self-judgment on it has lined up with their work over time. Already computed and
   * stored (skill-tag calibration, brief §2) — this only reads it. Empty when the
   * student has no records yet.
   */
  skills: StudentSkillCalibration[];
}

/**
 * A last-resort human-readable name when a skill tag is somehow missing: strip the
 * `skill-` prefix and turn the id's tokens back into words. Real skills carry a proper
 * tag label; this only keeps a stray id from reading like a slug.
 */
function readableSkillTail(skillId: string): string {
  const tail = skillId.replace(/^skill-/, "").replace(/-/g, " ").trim();
  return tail.length === 0 ? skillId : tail;
}

export async function getStudentTimeline(): Promise<StudentTimeline> {
  // Fail closed (tiered visibility): a timeline is a student's own data. A caller
  // with no student session is refused — never falls back to some other id.
  const studentId = await getSessionStudent();
  if (studentId === null) {
    throw new Error("Student authentication required.");
  }
  const world = await getWorld();

  // A "day" is a reflection the student FINISHED — not one a teacher happened to
  // grade. Ungraded reflections still appear (with their chosen next step); the
  // score, self-confidence, and alignment join in only once a performance exists.
  const sessions = await world.intel.sessions.listByStudent(studentId);
  const completed = sessions.filter((s) => s.status === "completed");

  const outcomes: ReflectionOutcome[] = [];
  const entries: TimelineEntry[] = [];

  for (const session of completed) {
    const lesson = await world.intel.lessons.findById(session.reflectionId);
    const performance = await world.intel.performances.findByReflectionAndStudent(
      session.reflectionId,
      studentId,
    );

    const entry: TimelineEntry = {
      reflectionId: session.reflectionId,
      title: lesson?.title ?? "Reflection",
      selectedAction: session.selectedAction,
      scorePercent: null,
      selfConfidencePercent: null,
      alignment: null,
      recordedAt: (session.completedAt ?? session.startedAt).toISOString(),
    };

    if (performance !== null) {
      const selfConfidence = readSelfConfidence(session);
      // Calibration needs a real score — this is the graded subset the trend runs over.
      const outcome = deriveReflectionOutcome(performance, selfConfidence);
      outcomes.push(outcome);
      entry.scorePercent = Math.round(outcome.performanceScore * 100);
      entry.selfConfidencePercent =
        selfConfidence === null ? null : Math.round(selfConfidence * 100);
      entry.alignment = outcome.alignment;
    }

    entries.push(entry);
  }

  // Newest first: the day the student just finished sits at the top.
  entries.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  // Per-skill calibration — read the already-stored records and resolve each skill's
  // learning-map label (its tag), falling back to a readable id tail if a tag is gone.
  const records = await world.intel.calibrationRecords.listByStudent(studentId);
  const labels = new Map<string, string>();
  for (const skillId of new Set(records.map((r) => r.skillId))) {
    const tag = await world.intel.skillTags.findById(skillId);
    labels.set(skillId, tag?.label ?? readableSkillTail(skillId));
  }
  const skills = summariseStudentSkillCalibration(
    records,
    (skillId) => labels.get(skillId) ?? readableSkillTail(skillId),
  );

  return { entries, trend: metacognitiveTrend(outcomes).direction, skills };
}
