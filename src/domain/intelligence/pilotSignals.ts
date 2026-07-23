import {
  summariseProbeMovement,
  type ProbeAttempt,
  type ProbeMovementDirection,
  type ProbeSelfScore,
} from "./probeAttempt";

/**
 * The two-week, no-teacher PILOT kill-test, reduced to its only honest success
 * signals. A first-principles test of this product asks one thing: with no teacher
 * pushing and no reward dangled, do students come BACK on their own to reflect
 * again — and when they do, does the from-memory check (the self-scored transfer
 * probe) actually move? This module folds a tenant's data into exactly those two
 * signals, aggregate and null-safe, so the question becomes MEASURABLE rather than
 * asserted (the build standard: honest evaluation or none).
 *
 * IMPORTANT — this is a POINT-IN-TIME SNAPSHOT, like `programMetrics`. Every number
 * is computed from the data currently in the repositories; there is NO trend across
 * process restarts and NO durable event history. A true longitudinal pilot readout
 * (return curve week over week, probe movement over the full two weeks) requires
 * DURABLE, persistent storage (Neon) that is not provisioned here — that piece is
 * deliberately DEFERRED.
 *
 * AGGREGATE ONLY (CLAUDE.md): the inputs are already stripped of identity — a plain
 * count per student and a plain list of self-scores per student, position-only, with
 * no id, name, or reflection content. Nothing per-student leaves; no student is
 * identifiable from any field of `PilotSignals`. Every rate is null when its
 * denominator is zero (never 0, so the UI can say "not enough data yet"), and the
 * raw counts ride alongside so no surface implies more precision than the data holds.
 *
 * Pure domain: deterministic folds only. No react/next/adapter imports.
 */

/**
 * Plain, adapter-free, identity-stripped data the action gathers for one tenant's
 * current pilot snapshot. Both arrays are per-student over the SAME cohort (the
 * tenant's students who have any reflection session); index alignment is not
 * required by the fold — each array is summarised independently.
 */
export interface PilotSignalsInput {
  /**
   * One entry per student: how many reflections that student has COMPLETED. A
   * student with 0 has started but not finished (or not started); a student with
   * ≥2 came back unprompted for a second reflection — the core return signal.
   */
  completedReflectionsByStudent: readonly number[];
  /**
   * One entry per student: that student's own from-memory-check self-scores, in
   * time order (oldest first). An empty inner array is a student who has done no
   * probe yet. Order carries the movement; the values are the student's own
   * three-way self-comparison, never a grade.
   */
  probeSelfScores: readonly (readonly ProbeSelfScore[])[];
}

/**
 * The aggregate pilot snapshot: voluntary return (#2 and #3) and whether the
 * from-memory check moves. Every rate null-safe; every denominator exposed raw.
 */
export interface PilotSignals {
  /** Students with ≥1 completed reflection — the active cohort and the return denominator. */
  activeStudents: number;
  /** Students who came back for a 2nd completed reflection (≥2) — unprompted return. */
  returnedForSecond: number;
  /** `returnedForSecond` ÷ `activeStudents`. Null when no student is active. */
  returnRateSecond: number | null;
  /** Students who came back a 3rd time (≥3 completed) — sustained voluntary return. */
  returnedForThird: number;
  /** `returnedForThird` ÷ `activeStudents`. Null when no student is active. */
  returnRateThird: number | null;
  /** Students who have done ≥1 from-memory check (probe). */
  probeCompletionCount: number;
  /** `probeCompletionCount` ÷ `activeStudents`. Null when no student is active. */
  probeCompletionRate: number | null;
  /** Students with ≥2 probes — the only ones for whom movement can be read (improving denominator). */
  studentsWithMultipleProbes: number;
  /** Of those, how many have an "improving" probe series (per `summariseProbeMovement`). */
  improvingCount: number;
  /**
   * `improvingCount` ÷ `studentsWithMultipleProbes` — the share of students whose
   * from-memory check actually moved up over their series. Null when fewer than two
   * probes exist for anyone (no movement can honestly be claimed). Task-focused:
   * it describes the work sticking, never ranks a student.
   */
  improvingShare: number | null;
}

/**
 * The direction of one student's own probe series, read through the canonical
 * `summariseProbeMovement`. The self-scores arrive already in time order, so each
 * is given a strictly increasing synthetic timestamp purely to preserve that order
 * through the summary's internal sort; the placeholder fields are never read by the
 * summary (it touches only `selfScore` and `attemptedAt`) and never leave here.
 */
function movementDirection(
  scores: readonly ProbeSelfScore[],
): ProbeMovementDirection {
  const attempts: ProbeAttempt[] = scores.map((selfScore, i) => ({
    id: `probe-${i}`,
    reflectionId: "reflection",
    studentId: "student",
    response: "-",
    selfScore,
    attemptedAt: new Date(i),
  }));
  return summariseProbeMovement(attempts).direction;
}

/**
 * Fold one tenant's current pilot data into the aggregate return + probe-movement
 * snapshot. Pure and deterministic: same input → same output, no clock, no I/O.
 * Every rate is guarded against a zero denominator (returns null, never divides).
 * This is a snapshot only — a durable return curve and full-window probe movement
 * need persistent storage and are deferred (see module doc).
 */
export function computePilotSignals(input: PilotSignalsInput): PilotSignals {
  const completed = input.completedReflectionsByStudent;
  const activeStudents = completed.filter((c) => c >= 1).length;
  const returnedForSecond = completed.filter((c) => c >= 2).length;
  const returnedForThird = completed.filter((c) => c >= 3).length;

  const probeCompletionCount = input.probeSelfScores.filter(
    (s) => s.length >= 1,
  ).length;

  const withMultipleProbes = input.probeSelfScores.filter((s) => s.length >= 2);
  const studentsWithMultipleProbes = withMultipleProbes.length;
  const improvingCount = withMultipleProbes.filter(
    (s) => movementDirection(s) === "improving",
  ).length;

  return {
    activeStudents,
    returnedForSecond,
    returnRateSecond:
      activeStudents === 0 ? null : returnedForSecond / activeStudents,
    returnedForThird,
    returnRateThird:
      activeStudents === 0 ? null : returnedForThird / activeStudents,
    probeCompletionCount,
    probeCompletionRate:
      activeStudents === 0 ? null : probeCompletionCount / activeStudents,
    studentsWithMultipleProbes,
    improvingCount,
    improvingShare:
      studentsWithMultipleProbes === 0
        ? null
        : improvingCount / studentsWithMultipleProbes,
  };
}
