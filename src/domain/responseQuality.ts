import type { Id } from "./common";

/**
 * ResponseQuality — the honesty architecture's data-quality gate
 * (docs/honesty-and-data-integrity.md). We never try to catch lies; we detect
 * LOW-QUALITY sessions deterministically at capture time and QUARANTINE them, so
 * bad-faith or minimal-compliance data cannot poison calibration or cohort
 * metrics. This is DATA QUALITY, never a verdict about the student.
 *
 * Standing prohibitions this module upholds:
 *  - No lie detection, honesty scoring, or consistency-checking of AFFECT CONTENT.
 *    The only affect signal here is structural (identical selections across many
 *    sessions), never sentiment-vs-claim.
 *  - QUARANTINE, NEVER CONFRONT. Nothing here is ever surfaced to the student, a
 *    teacher, or an admin. A quarantined session simply stops contributing to
 *    metrics and, on repetition, reads to the agent as DISENGAGEMENT (re-engage),
 *    never as an integrity flag.
 *
 * All detectors are pure and deterministic; thresholds are configurable.
 */

export type QualitySignal =
  | "straightlining"
  | "zero_variance_affect"
  | "implausible_latency"
  | "no_coverage";

export interface ResponseQualityConfig {
  /** Need at least this many item confidences before straight-lining is judgeable. */
  straightliningMinItems: number;
  /** Variance at or below this across item confidences ⇒ straight-lined. */
  straightliningVarEps: number;
  /** A single screen faster than this (ms) is implausibly fast. */
  latencyFloorMs: number;
  /** Identical affect selections across at least this many sessions ⇒ signal. */
  zeroVarianceAffectMinSessions: number;
}

export const DEFAULT_RESPONSE_QUALITY_CONFIG: ResponseQualityConfig = {
  straightliningMinItems: 3,
  straightliningVarEps: 1e-9,
  latencyFloorMs: 800,
  zeroVarianceAffectMinSessions: 3,
};

export interface ResponseQuality {
  sessionId: Id;
  studentId: Id;
  /** Which quality signals fired; empty when the session looks good-faith. */
  signals: QualitySignal[];
  /** True iff any signal fired. A quarantined session is excluded from metrics. */
  quarantined: boolean;
  at: Date;
}

// --- Pure detectors ----------------------------------------------------------

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

/** Near-zero variance across enough item confidences: the same answer every time. */
export function detectStraightlining(
  confidences: readonly number[],
  cfg: ResponseQualityConfig = DEFAULT_RESPONSE_QUALITY_CONFIG,
): boolean {
  if (confidences.length < cfg.straightliningMinItems) return false;
  return variance(confidences) <= cfg.straightliningVarEps;
}

/** Any single screen answered faster than the human floor. */
export function detectImplausibleLatency(
  screenLatenciesMs: readonly number[],
  cfg: ResponseQualityConfig = DEFAULT_RESPONSE_QUALITY_CONFIG,
): boolean {
  if (screenLatenciesMs.length === 0) return false;
  return screenLatenciesMs.some((ms) => ms < cfg.latencyFloorMs);
}

/**
 * Reflection text that references NONE of the actual items/skills — generic text
 * anchored to nothing. A purely lexical check; empty refs or empty text can't be
 * judged (returns false, never guesses).
 */
export function detectNoCoverage(
  text: string,
  refs: readonly string[],
): boolean {
  const haystack = text.toLowerCase();
  const meaningful = refs
    .flatMap((r) => r.toLowerCase().split(/[^a-z0-9]+/))
    .filter((w) => w.length >= 4);
  if (haystack.trim().length === 0 || meaningful.length === 0) return false;
  return !meaningful.some((w) => haystack.includes(w));
}

/**
 * The SAME affect selection repeated across enough sessions — structural, not a
 * judgement of the feelings themselves. `termSets` are each session's chosen
 * terms (order-insensitive), most recent included.
 */
export function detectZeroVarianceAffect(
  termSets: readonly (readonly string[])[],
  cfg: ResponseQualityConfig = DEFAULT_RESPONSE_QUALITY_CONFIG,
): boolean {
  if (termSets.length < cfg.zeroVarianceAffectMinSessions) return false;
  const key = (set: readonly string[]): string =>
    [...new Set(set.map((t) => t.toLowerCase()))].sort().join("|");
  const first = key(termSets[0]);
  if (first.length === 0) return false; // all-skips aren't a fabrication signal
  return termSets.every((set) => key(set) === first);
}

// --- Assessment --------------------------------------------------------------

export interface ResponseQualityInput {
  sessionId: Id;
  studentId: Id;
  at: Date;
  /** Item confidences from a prediction session (straight-lining). */
  confidences?: readonly number[];
  /** Per-screen response times in ms (implausible latency). */
  screenLatenciesMs?: readonly number[];
  /** A reflection's free text (coverage). */
  reflectionText?: string;
  /** Item/skill words the reflection ought to touch if it is genuine. */
  coverageRefs?: readonly string[];
  /** This student's affect selections across recent sessions (zero-variance). */
  affectTermSets?: readonly (readonly string[])[];
}

/**
 * Compute a session's quality from whatever signals its inputs support. Absent
 * inputs contribute no signal (never a false positive). Quarantine iff any signal
 * fired — the honest default the honesty doc specifies.
 */
export function assessResponseQuality(
  input: ResponseQualityInput,
  cfg: ResponseQualityConfig = DEFAULT_RESPONSE_QUALITY_CONFIG,
): ResponseQuality {
  const signals: QualitySignal[] = [];
  if (input.confidences && detectStraightlining(input.confidences, cfg)) {
    signals.push("straightlining");
  }
  if (
    input.screenLatenciesMs &&
    detectImplausibleLatency(input.screenLatenciesMs, cfg)
  ) {
    signals.push("implausible_latency");
  }
  if (
    input.reflectionText !== undefined &&
    input.coverageRefs !== undefined &&
    detectNoCoverage(input.reflectionText, input.coverageRefs)
  ) {
    signals.push("no_coverage");
  }
  if (input.affectTermSets && detectZeroVarianceAffect(input.affectTermSets, cfg)) {
    signals.push("zero_variance_affect");
  }
  return {
    sessionId: input.sessionId,
    studentId: input.studentId,
    signals,
    quarantined: signals.length > 0,
    at: input.at,
  };
}

/** A session is eligible for metrics iff it was not quarantined. */
export function isEligibleSession(quality: ResponseQuality): boolean {
  return !quality.quarantined;
}

/**
 * Drop items whose session was quarantined, before they reach calibration or any
 * cohort/efficacy aggregate — the single exclusion point the honesty doc calls
 * for. `keyOf` maps an item to its session id; qualities supply the quarantine
 * set. Generic so the same helper filters calibration contributions and cohort
 * samples alike.
 */
export function excludeQuarantined<T>(
  items: readonly T[],
  qualities: readonly ResponseQuality[],
  keyOf: (item: T) => Id,
): T[] {
  const quarantined = new Set(
    qualities.filter((q) => q.quarantined).map((q) => q.sessionId),
  );
  return items.filter((item) => !quarantined.has(keyOf(item)));
}
