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

/**
 * Which way a student's own from-memory checks have moved over time. Read against the
 * student's OWN series, never a peer or a bar: "improving" = each check landed at least
 * as well as the last and the series rose overall; "steady" = it held flat; "mixed" =
 * it dipped somewhere (fell or wobbled); "insufficient" = fewer than two checks, so no
 * trend can honestly be claimed. Task-focused: it describes the work sticking, not the
 * student.
 */
export type ProbeMovementDirection =
  | "improving"
  | "steady"
  | "mixed"
  | "insufficient";

/**
 * A calm, private summary of a student's self-scored probe history: how many landed at
 * each level, the most recent self-score, and which way the series has moved. It is a
 * READ over the student's own evidence — never a verdict, a grade, or a ranking.
 */
export interface ProbeMovement {
  got: number;
  partly: number;
  notYet: number;
  latestSelfScore: ProbeSelfScore | null;
  direction: ProbeMovementDirection;
}

/**
 * Fold a student's own probe attempts into a movement summary. Pure and deterministic:
 * counts each self-score, reads the newest attempt's score, and derives direction from
 * the time-ordered series mapped through `demonstratedFromSelfScore` (got=1, partly=.5,
 * not_yet=0). Fewer than two attempts → "insufficient". A non-decreasing series that
 * rose overall → "improving"; a flat series → "steady"; anything that dipped (fell or
 * wobbled) → "mixed". The input need not be pre-sorted.
 */
export function summariseProbeMovement(
  attempts: readonly ProbeAttempt[],
): ProbeMovement {
  const ordered = [...attempts].sort(
    (a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime(),
  );

  let got = 0;
  let partly = 0;
  let notYet = 0;
  for (const attempt of ordered) {
    if (attempt.selfScore === "got_it") got += 1;
    else if (attempt.selfScore === "partly") partly += 1;
    else notYet += 1;
  }

  const latestSelfScore: ProbeSelfScore | null =
    ordered.length === 0 ? null : ordered[ordered.length - 1].selfScore;

  const direction = deriveMovementDirection(ordered);

  return { got, partly, notYet, latestSelfScore, direction };
}

/** Direction over the time-ordered series of demonstrated values. */
function deriveMovementDirection(
  ordered: readonly ProbeAttempt[],
): ProbeMovementDirection {
  if (ordered.length < 2) return "insufficient";

  const values = ordered.map((a) => demonstratedFromSelfScore(a.selfScore));
  let dipped = false;
  let rose = false;
  for (let i = 1; i < values.length; i += 1) {
    const step = values[i] - values[i - 1];
    if (step < 0) dipped = true;
    else if (step > 0) rose = true;
  }

  if (dipped) return "mixed";
  return rose ? "improving" : "steady";
}
