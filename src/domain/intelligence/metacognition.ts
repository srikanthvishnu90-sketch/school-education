import { type Id } from "../common";
import { reflectionPerformanceSchema } from "../schemas/intelligence";
import type { ReflectionSession } from "./session";

/**
 * The honest, POST-HOC replacement for the retired pre-registered calibration.
 * Instead of asking a student to bet a confidence BEFORE they see the outcome,
 * we read the self-confidence they expressed DURING their reflection and set it
 * beside how they actually did. The result OPENS reflection ("your sense of it
 * ran ahead of the result this time"); it is never a grade, a trait, or a
 * red/green verdict (CLAUDE.md → congruence is a flag, feedback is task-focused).
 *
 * All of this is deterministic domain math — no model decides an alignment.
 */

/** The teacher-entered graded result a reflection is measured against (score entry). */
export interface ReflectionPerformance {
  reflectionId: Id;
  studentId: Id;
  /** Fraction 0..1 the student actually earned. */
  score: number;
  recordedAt: Date;
}

export function createReflectionPerformance(
  input: ReflectionPerformance,
): ReflectionPerformance {
  return Object.freeze(reflectionPerformanceSchema.parse(input));
}

export type PerformanceBand = "emerging" | "developing" | "secure";

/**
 * How a self-judgment lined up with the result. Named neutrally and used only to
 * OPEN reflection — the UI phrases it about the work, never "you are overconfident".
 */
export type MetacognitiveAlignment =
  | "aligned"
  | "confidence_ahead_of_result"
  | "result_ahead_of_confidence";

/**
 * The confidence scale labels the chat offers, mapped to a 0..1 position. Both the
 * confidence_slider and rating scales are covered; an unrecognized answer simply
 * doesn't contribute (no guessing a number out of free text).
 */
const CONFIDENCE_SCALE: Record<string, number> = {
  // confidence_slider
  "not yet": 0,
  "a little": 0.25,
  somewhat: 0.5,
  confident: 0.75,
  "very confident": 1,
  // rating
  "not at all": 0,
  mostly: 0.75,
  completely: 1,
};

/**
 * The student's self-reported confidence for a reflection, in [0, 1], or null if
 * they never answered a metacognitive scale question. Each student answer is paired
 * with the AI question it replied to (the immediately preceding AI turn); only
 * answers to `metacognitive` questions that match a known scale label count.
 */
export function readSelfConfidence(session: ReflectionSession): number | null {
  const values: number[] = [];
  const messages = session.messages;
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.sender !== "student") continue;
    const prompt = messages[i - 1];
    if (prompt === undefined || prompt.category !== "metacognitive") continue;
    const value = CONFIDENCE_SCALE[msg.text.trim().toLowerCase()];
    if (value !== undefined) values.push(value);
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Where a score sits: below half is emerging, up to 0.8 developing, else secure. */
export function performanceBand(score: number): PerformanceBand {
  if (score < 0.5) return "emerging";
  if (score < 0.8) return "developing";
  return "secure";
}

/** The default tolerance band within which confidence and performance count as aligned. */
export const ALIGNMENT_EPS = 0.15;

/**
 * Compare an expressed self-confidence to the actual score. Within `eps` they are
 * aligned; otherwise the sign says which ran ahead.
 */
export function compareConfidenceToPerformance(
  selfConfidence: number,
  score: number,
  eps: number = ALIGNMENT_EPS,
): MetacognitiveAlignment {
  const gap = selfConfidence - score;
  if (Math.abs(gap) <= eps) return "aligned";
  return gap > 0 ? "confidence_ahead_of_result" : "result_ahead_of_confidence";
}

/** One reflection set beside its graded result — the unit of the longitudinal view. */
export interface ReflectionOutcome {
  reflectionId: Id;
  studentId: Id;
  /** Null when the reflection had no metacognitive scale answer to read. */
  selfConfidence: number | null;
  performanceScore: number;
  band: PerformanceBand;
  /** Null when there was no self-confidence to compare. */
  alignment: MetacognitiveAlignment | null;
  recordedAt: Date;
}

/** Combine a graded result with the reflection's self-confidence into one outcome. */
export function deriveReflectionOutcome(
  performance: ReflectionPerformance,
  selfConfidence: number | null,
  eps: number = ALIGNMENT_EPS,
): ReflectionOutcome {
  return {
    reflectionId: performance.reflectionId,
    studentId: performance.studentId,
    selfConfidence,
    performanceScore: performance.score,
    band: performanceBand(performance.score),
    alignment:
      selfConfidence === null
        ? null
        : compareConfidenceToPerformance(selfConfidence, performance.score, eps),
    recordedAt: performance.recordedAt,
  };
}

/**
 * The class-level calibration read, in COUNTS only — never per-student. This is the
 * aggregate a teacher may see (Part 1 #1): how many graded students' in-chat
 * self-confidence ran ahead of, behind, or in line with their actual result. No
 * names, no emotional text, no ordering — a headcount per bucket. Buckets are named
 * neutrally and about the work, never "overconfident students" (feedback is
 * task-focused, and this only OPENS the teacher's read).
 */
export interface ClassCalibrationSummary {
  /** Graded students considered (each contributes one outcome). */
  gradedCount: number;
  /** Of those, how many also had a self-confidence to compare (alignment !== null). */
  comparableCount: number;
  /** Self-confidence matched the result within the tolerance band. */
  alignedCount: number;
  /** Self-confidence ran ahead of the result. */
  confidenceAheadCount: number;
  /** The result ran ahead of the self-confidence. */
  resultAheadCount: number;
}

/**
 * Fold a set of graded reflection outcomes into class-level calibration counts.
 * Aggregate only — the input is per-student but nothing per-student leaves this
 * function; the output is five headcounts. Outcomes without a self-confidence are
 * still counted as graded but never placed in a comparison bucket.
 */
export function summarizeClassCalibration(
  outcomes: readonly ReflectionOutcome[],
): ClassCalibrationSummary {
  let comparableCount = 0;
  let alignedCount = 0;
  let confidenceAheadCount = 0;
  let resultAheadCount = 0;
  for (const outcome of outcomes) {
    if (outcome.alignment === null) continue;
    comparableCount += 1;
    if (outcome.alignment === "aligned") alignedCount += 1;
    else if (outcome.alignment === "confidence_ahead_of_result") {
      confidenceAheadCount += 1;
    } else resultAheadCount += 1;
  }
  return {
    gradedCount: outcomes.length,
    comparableCount,
    alignedCount,
    confidenceAheadCount,
    resultAheadCount,
  };
}

export type TrendDirection =
  | "converging"
  | "diverging"
  | "steady"
  | "insufficient";

export interface MetacognitiveTrend {
  /** Signed gap (self-confidence − performance) per reflection, in time order. */
  points: { reflectionId: Id; gap: number; recordedAt: Date }[];
  /** Whether the student's self-judgment is getting closer to their results. */
  direction: TrendDirection;
}

/**
 * The longitudinal read: is the student's self-judgment getting MORE accurate over
 * time? We track the signed gap per reflection (only those with a self-confidence),
 * and compare the magnitude of the first gap to the last. Fewer than two points is
 * `insufficient` — trajectory over a single judgment is never asserted (CLAUDE.md →
 * trust trajectory over any single self-judgment).
 */
export function metacognitiveTrend(
  outcomes: readonly ReflectionOutcome[],
  eps: number = ALIGNMENT_EPS,
): MetacognitiveTrend {
  const ordered = [...outcomes]
    .filter((o): o is ReflectionOutcome & { selfConfidence: number } =>
      o.selfConfidence !== null,
    )
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const points = ordered.map((o) => ({
    reflectionId: o.reflectionId,
    gap: o.selfConfidence - o.performanceScore,
    recordedAt: o.recordedAt,
  }));
  if (points.length < 2) return { points, direction: "insufficient" };
  const first = Math.abs(points[0].gap);
  const last = Math.abs(points[points.length - 1].gap);
  const delta = last - first;
  const direction: TrendDirection =
    Math.abs(delta) <= eps ? "steady" : delta < 0 ? "converging" : "diverging";
  return { points, direction };
}
