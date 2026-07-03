import { z } from "zod";
import type { EvidenceGrade } from "./cohort";

/**
 * Pilot telemetry — instrumentation that measures MECHANICS, never content
 * (docs/honesty-and-data-integrity.md). The pilot's core question: does a student
 * return and predict honestly a SECOND time? To answer it without surveilling,
 * every event is a closed enum + ids + timings — NO free text, NO affect labels,
 * NO item-level answers. The event type below makes that a compile-time guarantee:
 * there is no string field a caller could smuggle content through, and the schema
 * is `.strict()`.
 *
 * Telemetry is itself a consent scope; the recorder writes nothing without it.
 * studentId here is a PSEUDONYM — the real-id mapping lives in a separate,
 * service-role-only table.
 */

export type PilotEventType =
  | "cycle_started"
  | "prediction_completed"
  | "evidence_viewed"
  | "affect_completed"
  | "affect_skipped"
  | "reflection_completed"
  | "action_committed"
  | "cycle_completed"
  | "cycle_abandoned"
  | "session_quarantined"
  | "reengagement_shown"
  | "reengagement_acted";

/** Closed set of screen identifiers — an enum, never free text. */
export type ScreenId =
  | "predict"
  | "result"
  | "reflect_emotion"
  | "reflect_probe"
  | "reflect_cause"
  | "reflect_fixable"
  | "reflect_commit"
  | "map";

export interface PilotEvent {
  /** Pseudonymized student id — never the real id. */
  studentId: string;
  tenantId: string;
  type: PilotEventType;
  /** Which screen (enum), where relevant (e.g. abandonment). */
  screenId?: ScreenId;
  /** Per-screen response time, ms. */
  latencyMs?: number;
  /** Elapsed time within the cycle at this event, ms. */
  elapsedInCycleMs?: number;
  /** Which cycle in the student's sequence (1-based). */
  cycleN: number;
  at: Date;
}

const pilotEventTypeSchema = z.enum([
  "cycle_started",
  "prediction_completed",
  "evidence_viewed",
  "affect_completed",
  "affect_skipped",
  "reflection_completed",
  "action_committed",
  "cycle_completed",
  "cycle_abandoned",
  "session_quarantined",
  "reengagement_shown",
  "reengagement_acted",
]);

const screenIdSchema = z.enum([
  "predict",
  "result",
  "reflect_emotion",
  "reflect_probe",
  "reflect_cause",
  "reflect_fixable",
  "reflect_commit",
  "map",
]);

/**
 * `.strict()` is load-bearing: it REJECTS any unknown key, so a caller cannot
 * smuggle a free-text `note`, an affect label, or an answer into an event. Every
 * field is an enum, an id, a finite number, or a date.
 */
export const pilotEventSchema = z
  .object({
    studentId: z.string().min(1),
    tenantId: z.string().min(1),
    type: pilotEventTypeSchema,
    screenId: screenIdSchema.optional(),
    latencyMs: z.number().finite().nonnegative().optional(),
    elapsedInCycleMs: z.number().finite().nonnegative().optional(),
    cycleN: z.number().int().positive(),
    at: z.date(),
  })
  .strict();

export function createPilotEvent(input: PilotEvent): PilotEvent {
  return Object.freeze(pilotEventSchema.parse(input));
}

/**
 * Compile-time guarantee that the event shape is EXACTLY the strict schema — no
 * field can drift onto the interface without the schema (and vice-versa). Since
 * every schema field is an enum/id/number/date, this makes "no free text" a
 * type-level property, not a convention. Purely type-level; nothing runs.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
export type _PilotEventSync = Expect<
  Equal<PilotEvent, z.infer<typeof pilotEventSchema>>
>;

// --- Measurement queries (pure, evidence-graded, min-n gated) -----------------

/** A graded measurement — associational at best (single-arm pilot), min-n gated. */
export interface Measurement<T> {
  value: T | null;
  n: number;
  grade: EvidenceGrade;
}

export interface MeasurementConfig {
  /** Below this N, no point estimate is emitted (grade `insufficient_n`). */
  minN: number;
  /** Return window after a cycle, ms (default 14 days). */
  windowMs: number;
  /** The per-cycle time budget, ms (default 3 minutes). */
  budgetMs: number;
}

export const DEFAULT_MEASUREMENT_CONFIG: MeasurementConfig = {
  minN: 5,
  windowMs: 14 * 24 * 60 * 60 * 1000,
  budgetMs: 3 * 60 * 1000,
};

function grade(n: number, minN: number): EvidenceGrade {
  return n < minN ? "insufficient_n" : "associational";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * A student's OPPORTUNITY to return: an eligible next assessment existed after
 * `afterCycleN`, available at `eligibleAt`. The return-rate denominator counts
 * only these — a student who never had a chance to return is not a non-returner.
 */
export interface ReturnOpportunity {
  studentId: string;
  afterCycleN: number;
  eligibleAt: Date;
}

export interface ReturnRate {
  numerator: number;
  denominator: number;
}

/**
 * THE metric: of students who HAD an eligible chance to return, what fraction
 * completed the next cycle within the window. The denominator excludes students
 * with no opportunity — the honest denominator, not "everyone".
 */
export function returnRate(
  events: readonly PilotEvent[],
  opportunities: readonly ReturnOpportunity[],
  config: MeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): Measurement<ReturnRate> {
  // A student's completed-cycle times, for the in-window check.
  const completedByStudentCycle = new Map<string, number[]>();
  for (const e of events) {
    if (e.type !== "cycle_completed") continue;
    const key = `${e.studentId}#${e.cycleN}`;
    const list = completedByStudentCycle.get(key) ?? [];
    list.push(e.at.getTime());
    completedByStudentCycle.set(key, list);
  }

  let numerator = 0;
  const denominator = opportunities.length;
  for (const opp of opportunities) {
    const nextTimes =
      completedByStudentCycle.get(`${opp.studentId}#${opp.afterCycleN + 1}`) ?? [];
    const deadline = opp.eligibleAt.getTime() + config.windowMs;
    if (nextTimes.some((t) => t <= deadline)) numerator += 1;
  }
  return {
    value: denominator === 0 ? null : { numerator, denominator },
    n: denominator,
    grade: grade(denominator, config.minN),
  };
}

/**
 * Honest-engagement proxy: of the cycles a student COMPLETED, what fraction were
 * NOT quarantined (P15). A cycle is quarantined if a `session_quarantined` event
 * shares its (student, cycleN).
 */
export function honestEngagementRate(
  events: readonly PilotEvent[],
  config: MeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): Measurement<number> {
  const quarantined = new Set(
    events
      .filter((e) => e.type === "session_quarantined")
      .map((e) => `${e.studentId}#${e.cycleN}`),
  );
  const completed = events.filter((e) => e.type === "cycle_completed");
  const clean = completed.filter(
    (e) => !quarantined.has(`${e.studentId}#${e.cycleN}`),
  ).length;
  return {
    value: completed.length === 0 ? null : clean / completed.length,
    n: completed.length,
    grade: grade(completed.length, config.minN),
  };
}

export interface AffectSkipTrendPoint {
  cycleN: number;
  rate: number;
  n: number;
}

export interface AffectSkip {
  overall: number;
  /** Skip rate per cycle — a HEALTHY signal, tracked not fought. */
  trend: AffectSkipTrendPoint[];
}

/** Affect skip rate overall and by cycle. Skipping is a pressure-release, not a failure. */
export function affectSkipRate(
  events: readonly PilotEvent[],
  config: MeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): Measurement<AffectSkip> {
  const affect = events.filter(
    (e) => e.type === "affect_skipped" || e.type === "affect_completed",
  );
  if (affect.length === 0) {
    return { value: null, n: 0, grade: grade(0, config.minN) };
  }
  const byCycle = new Map<number, { skipped: number; total: number }>();
  let skipped = 0;
  for (const e of affect) {
    const bucket = byCycle.get(e.cycleN) ?? { skipped: 0, total: 0 };
    bucket.total += 1;
    if (e.type === "affect_skipped") {
      bucket.skipped += 1;
      skipped += 1;
    }
    byCycle.set(e.cycleN, bucket);
  }
  const trend: AffectSkipTrendPoint[] = [...byCycle.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cycleN, b]) => ({ cycleN, rate: b.skipped / b.total, n: b.total }));
  return {
    value: { overall: skipped / affect.length, trend },
    n: affect.length,
    grade: grade(affect.length, config.minN),
  };
}

export interface TimePerCycle {
  medianMs: number;
  /** Fraction of completed cycles within the time budget. */
  withinBudget: number;
}

/** Time-per-cycle distribution vs. the budget, from `cycle_completed` elapsed times. */
export function timePerCycle(
  events: readonly PilotEvent[],
  config: MeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): Measurement<TimePerCycle> {
  const times = events
    .filter((e) => e.type === "cycle_completed" && e.elapsedInCycleMs !== undefined)
    .map((e) => e.elapsedInCycleMs as number);
  const med = median(times);
  return {
    value:
      med === null
        ? null
        : {
            medianMs: med,
            withinBudget:
              times.filter((t) => t <= config.budgetMs).length / times.length,
          },
    n: times.length,
    grade: grade(times.length, config.minN),
  };
}

export interface ScreenAbandonment {
  screenId: ScreenId | "unknown";
  count: number;
  medianElapsedMs: number | null;
}

/**
 * Abandonment by screen × elapsed time — distinguishes a FLOW LEAK (bailing early
 * on a screen) from a time-boxed exit (leaving late, having engaged). Not graded:
 * it is descriptive, per-screen.
 */
export function abandonmentByScreen(
  events: readonly PilotEvent[],
): ScreenAbandonment[] {
  const byScreen = new Map<string, number[]>();
  for (const e of events) {
    if (e.type !== "cycle_abandoned") continue;
    const key = e.screenId ?? "unknown";
    const list = byScreen.get(key) ?? [];
    if (e.elapsedInCycleMs !== undefined) list.push(e.elapsedInCycleMs);
    byScreen.set(key, list);
  }
  return [...byScreen.entries()].map(([screenId, times]) => ({
    screenId: screenId as ScreenId | "unknown",
    count: times.length === 0 ? 0 : times.length,
    medianElapsedMs: median(times),
  }));
}

export interface CalibrationSeries {
  studentId: string;
  /** Bias per cycle, in cycle order. */
  biases: number[];
}

/**
 * Calibration delta across cycles (P3 trajectory) — the mean, per student, of the
 * change in |bias| from first to last cycle. Negative = converging on truth. Only
 * students with ≥ 2 cycles contribute; min-n gated over those students.
 */
export function calibrationDelta(
  series: readonly CalibrationSeries[],
  config: MeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): Measurement<number> {
  const deltas: number[] = [];
  for (const s of series) {
    if (s.biases.length < 2) continue;
    const first = Math.abs(s.biases[0]);
    const last = Math.abs(s.biases[s.biases.length - 1]);
    deltas.push(last - first);
  }
  const mean =
    deltas.length === 0
      ? null
      : deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return {
    value: deltas.length < config.minN ? null : mean,
    n: deltas.length,
    grade: grade(deltas.length, config.minN),
  };
}

/**
 * Follow-through: of the re-engagements SHOWN, what fraction the student ACTED on.
 * Behavioral (event-based), never a self-reported checkbox (honesty doc).
 */
export function followThroughRate(
  events: readonly PilotEvent[],
  config: MeasurementConfig = DEFAULT_MEASUREMENT_CONFIG,
): Measurement<number> {
  const acted = new Set(
    events
      .filter((e) => e.type === "reengagement_acted")
      .map((e) => `${e.studentId}#${e.cycleN}`),
  );
  const shown = events.filter((e) => e.type === "reengagement_shown");
  const followed = shown.filter((e) =>
    acted.has(`${e.studentId}#${e.cycleN}`),
  ).length;
  return {
    value: shown.length === 0 ? null : followed / shown.length,
    n: shown.length,
    grade: grade(shown.length, config.minN),
  };
}
