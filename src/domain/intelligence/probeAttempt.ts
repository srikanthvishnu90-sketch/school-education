import { type Id } from "../common";
import { probeAttemptSchema } from "../schemas/intelligence";

/**
 * A STUDENT-owned, self-scored transfer-probe attempt — the data behind the
 * in-session payoff. After a reflection, the student attempts a fresh problem
 * FROM MEMORY (retrieval practice), reveals the teacher's worked exemplar
 * (Lesson.exemplar — feedback against a CORRECT answer, the Kluger & DeNisi
 * principle), and then self-scores how their attempt compared.
 *
 * Two product rules are load-bearing here:
 *  - This is the STUDENT's own evidence, generated and scored by the student, in
 *    session. It is NOT a teacher grade and never appears on a teacher/admin read
 *    path. Calibration can resolve immediately from it (see `demonstratedFromSelfScore`).
 *  - `selfScore` is a three-way self-comparison against the exemplar, never a
 *    green/red verdict: it feeds the same task-focused calibration signal a graded
 *    score would, so the student can locate where judgment ran ahead of the work.
 *
 * Pure domain: no react/next/adapter imports; invariants live in the factory/schema.
 */

/**
 * The student's own three-way comparison of their from-memory attempt against the
 * revealed exemplar. Deliberately coarse and self-referential — it asks "how did
 * mine line up?", not "right or wrong".
 */
export type ProbeSelfScore = "got_it" | "partly" | "not_yet";

export interface ProbeAttempt {
  id: Id;
  /** The reflection (lesson) this probe belongs to. */
  reflectionId: Id;
  /** The student who attempted and self-scored it — the owner of this record. */
  studentId: Id;
  /** The skill the probe exercises, when known (lets calibration attach per-skill). */
  skillId?: Id;
  /** The student's from-memory attempt, in their own words (bounded 1..4000). */
  response: string;
  /** The student's self-comparison against the revealed exemplar. */
  selfScore: ProbeSelfScore;
  attemptedAt: Date;
}

/**
 * Construct a ProbeAttempt, enforcing its invariants (non-empty bounded response,
 * a valid selfScore) at the boundary. Frozen, like the sibling calibration factories.
 */
export function createProbeAttempt(input: ProbeAttempt): ProbeAttempt {
  return Object.freeze(probeAttemptSchema.parse(input));
}

/**
 * The bridge that lets a self-scored probe feed `computeSkillCalibration` as its
 * `demonstrated` fraction: got_it = 1, partly = 0.5, not_yet = 0. This is what makes
 * calibration STUDENT-GENERATED and IMMEDIATE — the student closes the loop in
 * session without waiting for a teacher grade. The value is the student's OWN
 * evidence of transfer, not an institutional judgment.
 */
export function demonstratedFromSelfScore(score: ProbeSelfScore): number {
  switch (score) {
    case "got_it":
      return 1;
    case "partly":
      return 0.5;
    case "not_yet":
      return 0;
  }
}
