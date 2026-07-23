import { type Id } from "../common";
import type { SessionStatus } from "./session";
import type { MetacognitiveAlignment } from "./metacognition";

/**
 * Program-level metrics for the district-admin surface (brief D1). This is the
 * aggregate, TASK-focused read a district admin gets: how much of the roster has
 * engaged, how much reflection work is finished, and — stated as distance, never as
 * good/bad — how closely students' self-judgment has tracked their results.
 *
 * IMPORTANT — this is a POINT-IN-TIME SNAPSHOT. Every number here is computed from
 * the data currently in the repositories; there is NO trend-over-time, NO history
 * across process restarts. A true longitudinal program view (participation this week
 * vs. last, the alignment share moving month over month) requires DURABLE, persistent
 * storage (Neon) that is not provisioned here — that piece is deliberately DEFERRED.
 *
 * Every rate is null-safe: a rate whose denominator is zero is `null`, never 0, so the
 * UI can say "not enough data yet" instead of implying a real 0%. The raw denominators
 * ride along (gradedCount/startedCount/completedCount) so no surface ever implies more
 * precision than the underlying counts support.
 *
 * SAFETY (CLAUDE.md): the calibration gap is stated as DISTANCE from one's own results
 * (lower = closer self-knowledge), a task-focused fact — never a grade, never a trait,
 * never colour-coded green=good / red=bad. Aggregate only: nothing per-student leaves.
 *
 * Pure domain: deterministic folds only. No react/next/adapter imports.
 */

/** One reflection session, reduced to the two fields the aggregation needs. */
export interface ProgramMetricsSession {
  /** Whose session this is — used ONLY to count distinct participants; never emitted. */
  studentId: Id;
  status: SessionStatus;
}

/** One graded reflection, reduced to the alignment the aggregation needs. */
export interface ProgramMetricsGradedOutcome {
  /** Null when the reflection carried no self-confidence to compare against the score. */
  alignment: MetacognitiveAlignment | null;
}

/** Plain, adapter-free data the action gathers for one tenant's current snapshot. */
export interface ProgramMetricsInput {
  /**
   * The roster-of-record size — the count of students who COULD participate (the
   * denominator for participation). Zero → participation is null (nobody to measure).
   */
  rosterSize: number;
  /** Every reflection session in scope, one entry per started session. */
  sessions: readonly ProgramMetricsSession[];
  /** One entry per graded reflection (a teacher-entered score exists for it). */
  gradedOutcomes: readonly ProgramMetricsGradedOutcome[];
  /**
   * The SIGNED calibration deltas (claim − demonstrated) of every graded calibration
   * record in scope. The magnitude is taken here; the caller passes them signed.
   */
  calibrationDeltas: readonly number[];
}

/** The aggregate program snapshot. Every rate null-safe; raw denominators exposed. */
export interface ProgramMetrics {
  /**
   * Distinct students who started at least one reflection ÷ rosterSize, clamped to
   * [0, 1]. Null when rosterSize is 0. Clamped because the started set can exceed the
   * current roster-of-record (e.g. a student who has sessions but whose standing
   * permission has since been withdrawn is no longer on the roster).
   */
  participationRate: number | null;
  /** Completed sessions ÷ started sessions. Null when nothing has started. */
  completionRate: number | null;
  /**
   * Share of graded reflections whose self-judgment was "aligned" with the result.
   * Null when nothing is graded. Denominator is every graded reflection (a graded
   * reflection with no self-confidence to compare counts as not-aligned).
   */
  alignmentShare: number | null;
  /**
   * Mean of |delta| over graded calibration records — the average DISTANCE between
   * what students judged and what they demonstrated. Lower = closer self-knowledge.
   * Stated task-focused; never good/bad, never red/green. Null when none is graded.
   */
  meanAbsCalibrationGap: number | null;
  /** How many graded reflections back `alignmentShare` (its denominator). */
  gradedCount: number;
  /** How many sessions were started (the `completionRate` denominator). */
  startedCount: number;
  /** How many started sessions are completed (the `completionRate` numerator). */
  completedCount: number;
  /** The roster-of-record size (the `participationRate` denominator). */
  rosterSize: number;
  /** Distinct students who started ≥1 reflection (the `participationRate` numerator). */
  participantCount: number;
  /** How many graded calibration records back `meanAbsCalibrationGap` (its denominator). */
  calibrationGapCount: number;
}

/** Clamp a number into [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Fold one tenant's current data into the aggregate program snapshot. Pure and
 * deterministic: same input → same output, no clock, no I/O. Every rate is guarded
 * against a zero denominator (returns null, never divides). This is a snapshot only —
 * trend-over-time requires durable storage and is deferred (see module doc).
 */
export function computeProgramMetrics(input: ProgramMetricsInput): ProgramMetrics {
  const startedCount = input.sessions.length;
  const completedCount = input.sessions.filter(
    (s) => s.status === "completed",
  ).length;
  const distinctStarted = new Set(input.sessions.map((s) => s.studentId)).size;

  const gradedCount = input.gradedOutcomes.length;
  const alignedCount = input.gradedOutcomes.filter(
    (o) => o.alignment === "aligned",
  ).length;

  const gapCount = input.calibrationDeltas.length;
  const gapSum = input.calibrationDeltas.reduce((sum, d) => sum + Math.abs(d), 0);

  return {
    participationRate:
      input.rosterSize === 0 ? null : clamp01(distinctStarted / input.rosterSize),
    completionRate: startedCount === 0 ? null : completedCount / startedCount,
    alignmentShare: gradedCount === 0 ? null : alignedCount / gradedCount,
    meanAbsCalibrationGap: gapCount === 0 ? null : gapSum / gapCount,
    gradedCount,
    startedCount,
    completedCount,
    rosterSize: input.rosterSize,
    participantCount: distinctStarted,
    calibrationGapCount: gapCount,
  };
}
