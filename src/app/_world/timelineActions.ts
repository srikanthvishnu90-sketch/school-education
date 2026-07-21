"use server";

import {
  deriveReflectionOutcome,
  metacognitiveTrend,
  readSelfConfidence,
  type MetacognitiveAlignment,
  type ReflectionOutcome,
  type TrendDirection,
} from "@/domain/intelligence/metacognition";
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
}

export async function getStudentTimeline(): Promise<StudentTimeline> {
  const studentId = (await getSessionStudent()) ?? "student-demo";
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
  return { entries, trend: metacognitiveTrend(outcomes).direction };
}
