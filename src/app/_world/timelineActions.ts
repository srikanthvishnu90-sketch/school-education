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
  /** 0..100, or null when no score has been recorded yet. */
  scorePercent: number | null;
  /** 0..100, or null when the reflection had no confidence answer. */
  selfConfidencePercent: number | null;
  alignment: MetacognitiveAlignment | null;
  recordedAt: string;
}

export interface StudentTimeline {
  entries: TimelineEntry[];
  trend: TrendDirection;
}

export async function getStudentTimeline(): Promise<StudentTimeline> {
  const studentId = (await getSessionStudent()) ?? "student-demo";
  const world = await getWorld();

  const performances = await world.intel.performances.listByStudent(studentId);
  const outcomes: ReflectionOutcome[] = [];
  const entries: TimelineEntry[] = [];

  for (const perf of performances) {
    const session = await world.intel.sessions.findByReflectionAndStudent(
      perf.reflectionId,
      studentId,
    );
    const selfConfidence = session === null ? null : readSelfConfidence(session);
    const outcome = deriveReflectionOutcome(perf, selfConfidence);
    outcomes.push(outcome);

    const lesson = await world.intel.lessons.findById(perf.reflectionId);
    entries.push({
      reflectionId: perf.reflectionId,
      title: lesson?.title ?? "Reflection",
      scorePercent: Math.round(outcome.performanceScore * 100),
      selfConfidencePercent:
        selfConfidence === null ? null : Math.round(selfConfidence * 100),
      alignment: outcome.alignment,
      recordedAt: perf.recordedAt.toISOString(),
    });
  }

  entries.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return { entries, trend: metacognitiveTrend(outcomes).direction };
}
