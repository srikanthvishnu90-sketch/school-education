import type { Id } from "./common";

/**
 * Cohort-level efficacy analytics — pure aggregation over per-student
 * verification (P7). The governing rule (CLAUDE.md): a cohort improving is NOT
 * evidence the product works. Maturation, selection, attrition, seasonality,
 * teacher effects, and regression to the mean all manufacture improvement. So
 * single-arm before/after is NEVER an efficacy claim: every output is labeled
 * `associational` unless a real control exists, every result carries its
 * confounds in the open, and below a minimum N no point estimate is emitted.
 *
 * This module is pure and deterministic: no clock, no I/O, no LLM. The gap is a
 * LOWER-IS-BETTER calibration measure (e.g. |bias|), so a NEGATIVE gap-change is
 * an improvement.
 */

export type EvidenceGrade =
  | "associational"
  | "dose_response"
  | "quasi_experimental"
  | "insufficient_n";

export interface CohortWindow {
  cohortId: Id;
  from: Date;
  to: Date;
  studentIds: Id[];
}

/** Staggered-rollout hook: when a cohort's treatment began. */
export interface CohortAssignment {
  cohortId: Id;
  startedAt: Date;
}

/**
 * One student's calibration-gap trajectory within a window. `gaps` are ordered
 * oldest→newest, lower = better; a DROPOUT is held at its last value simply by
 * its series ending early. `completed` marks a student still active at window
 * end (vs. a dropout).
 */
export interface StudentGapSeries {
  studentId: Id;
  gaps: number[];
  cyclesCompleted: number;
  completed: boolean;
  entryGranularity: number;
}

export interface CohortAnalysisConfig {
  /** Below this N, no point estimate is emitted (grade `insufficient_n`). */
  minN: number;
  /** Test-retest reliability r ∈ [0,1] used for the mean-reversion expectation. */
  reversionReliability: number;
  /** Entry gap above the cohort mean by more than this counts as "extreme". */
  extremeEntryThreshold: number;
}

export const DEFAULT_COHORT_CONFIG: CohortAnalysisConfig = {
  minN: 10,
  reversionReliability: 0.5,
  extremeEntryThreshold: 0.15,
};

// --- Small deterministic statistics ------------------------------------------

function mean(xs: readonly number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function ascending(xs: readonly number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** Linear-interpolated quantile over an already-sorted array (non-empty). */
function quantile(sortedXs: readonly number[], q: number): number {
  const n = sortedXs.length;
  if (n === 1) return sortedXs[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedXs[lo];
  return sortedXs[lo] * (hi - pos) + sortedXs[hi] * (pos - lo);
}

function entryGap(s: StudentGapSeries): number {
  return s.gaps[0];
}

function finalGap(s: StudentGapSeries): number {
  return s.gaps[s.gaps.length - 1];
}

/** Negative = improvement (gap is lower-is-better). */
function gapChange(s: StudentGapSeries): number {
  return finalGap(s) - entryGap(s);
}

// --- Distribution (never just the mean) --------------------------------------

export interface Distribution {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
}

function distributionOf(xs: readonly number[]): Distribution {
  const s = ascending(xs);
  return {
    n: s.length,
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[s.length - 1],
    mean: mean(s),
  };
}

// --- Dose-response (cycles-completed vs. gap-change) --------------------------

export interface DoseBucket {
  cyclesCompleted: number;
  n: number;
  meanGapChange: number;
}

export interface DoseResponse {
  buckets: DoseBucket[];
  /** Descriptive least-squares slope of gap-change on cycles. NOT a hypothesis test. */
  slope: number;
  grade: EvidenceGrade;
}

function leastSquaresSlope(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function doseResponseOf(
  series: readonly StudentGapSeries[],
  minN: number,
): DoseResponse {
  const byDose = new Map<number, number[]>();
  for (const s of series) {
    const list = byDose.get(s.cyclesCompleted) ?? [];
    list.push(gapChange(s));
    byDose.set(s.cyclesCompleted, list);
  }
  const buckets: DoseBucket[] = [...byDose.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cyclesCompleted, changes]) => ({
      cyclesCompleted,
      n: changes.length,
      meanGapChange: mean(changes),
    }));

  const xs = series.map((s) => s.cyclesCompleted);
  const ys = series.map(gapChange);
  const slope = leastSquaresSlope(xs, ys);
  const distinctDoses = new Set(xs).size;
  const grade: EvidenceGrade =
    series.length < minN
      ? "insufficient_n"
      : distinctDoses >= 2
        ? "dose_response"
        : "associational";
  return { buckets, slope, grade };
}

// --- Confound annotations (mandatory on every result) ------------------------

export interface AttritionAnnotation {
  startingN: number;
  completersN: number;
  /** Full starting cohort with dropouts held at their last value. */
  fullCohortMeanGapChange: number | null;
  completersMeanGapChange: number | null;
  /** completers − full: the survivorship bias, surfaced not hidden. */
  survivorshipBias: number | null;
}

function attritionOf(series: readonly StudentGapSeries[]): AttritionAnnotation {
  const completers = series.filter((s) => s.completed);
  const fullMean = series.length > 0 ? mean(series.map(gapChange)) : null;
  const completersMean =
    completers.length > 0 ? mean(completers.map(gapChange)) : null;
  const bias =
    fullMean !== null && completersMean !== null
      ? completersMean - fullMean
      : null;
  return {
    startingN: series.length,
    completersN: completers.length,
    fullCohortMeanGapChange: fullMean,
    completersMeanGapChange: completersMean,
    survivorshipBias: bias,
  };
}

export interface RegressionToMeanAnnotation {
  extremeN: number;
  /** Observed mean gap-change among the extreme-entry students. */
  observedMeanGapChange: number;
  /** What mean-reversion ALONE predicts for them (compare against this, not zero). */
  expectedReversionChange: number;
  /** observed − expected: the part NOT explained by regression to the mean. */
  excessBeyondReversion: number;
}

function regressionToMeanOf(
  series: readonly StudentGapSeries[],
  config: CohortAnalysisConfig,
): RegressionToMeanAnnotation | null {
  const cohortMeanEntry = mean(series.map(entryGap));
  const extreme = series.filter(
    (s) => entryGap(s) > cohortMeanEntry + config.extremeEntryThreshold,
  );
  if (extreme.length === 0) return null;

  const observed = mean(extreme.map(gapChange));
  // Expected reverted value = mean + r·(entry − mean); so the expected CHANGE is
  // (r − 1)·(entry − mean): a partial pull toward the mean, no treatment needed.
  const expected = mean(
    extreme.map(
      (s) => (config.reversionReliability - 1) * (entryGap(s) - cohortMeanEntry),
    ),
  );
  return {
    extremeN: extreme.length,
    observedMeanGapChange: observed,
    expectedReversionChange: expected,
    excessBeyondReversion: observed - expected,
  };
}

export interface BaselineCovariates {
  n: number;
  meanEntryGap: number | null;
  medianEntryGap: number | null;
  meanEntryGranularity: number | null;
}

function baselineOf(series: readonly StudentGapSeries[]): BaselineCovariates {
  if (series.length === 0) {
    return {
      n: 0,
      meanEntryGap: null,
      medianEntryGap: null,
      meanEntryGranularity: null,
    };
  }
  const entries = series.map(entryGap);
  return {
    n: series.length,
    meanEntryGap: mean(entries),
    medianEntryGap: quantile(ascending(entries), 0.5),
    meanEntryGranularity: mean(series.map((s) => s.entryGranularity)),
  };
}

// --- The single-arm cohort result --------------------------------------------

export interface CohortEfficacyResult {
  cohortId: Id;
  /** Never exceeds what a single-arm design supports: associational | insufficient_n. */
  grade: EvidenceGrade;
  n: number;
  meanGapChange: number | null;
  medianGapChange: number | null;
  distribution: Distribution | null;
  doseResponse: DoseResponse | null;
  /** Always present — the confound is surfaced even under insufficient N. */
  attrition: AttritionAnnotation;
  regressionToMean: RegressionToMeanAnnotation | null;
  baseline: BaselineCovariates;
  caveats: string[];
}

function fmt(x: number | null): string {
  return x === null ? "n/a" : x.toFixed(3);
}

/**
 * The core aggregation. Produces an `associational` result with every confound
 * annotated, or `insufficient_n` (point estimates suppressed) below `minN`. It
 * can NEVER return a causal or quasi-experimental grade — that requires a
 * control, which a single cohort does not have.
 */
export function analyzeCohort(
  cohortId: Id,
  series: readonly StudentGapSeries[],
  config: CohortAnalysisConfig = DEFAULT_COHORT_CONFIG,
): CohortEfficacyResult {
  const n = series.length;
  const attrition = attritionOf(series);
  const baseline = baselineOf(series);
  const caveats = [
    "single-arm cohort: associational only — a cohort improving is not evidence the product works",
  ];

  if (n < config.minN) {
    caveats.push(
      `n=${n} below minimum ${config.minN}; no point estimate emitted`,
    );
    return {
      cohortId,
      grade: "insufficient_n",
      n,
      meanGapChange: null,
      medianGapChange: null,
      distribution: null,
      doseResponse: null,
      // Keep the structural counts; suppress the change estimates.
      attrition: {
        ...attrition,
        fullCohortMeanGapChange: null,
        completersMeanGapChange: null,
        survivorshipBias: null,
      },
      regressionToMean: null,
      baseline,
      caveats,
    };
  }

  const changes = series.map(gapChange);
  const regressionToMean = regressionToMeanOf(series, config);
  if (regressionToMean !== null) {
    caveats.push(
      "cohort contains extreme-entry students; read improvement against expected mean-reversion, not zero",
    );
  }
  caveats.push(
    `attrition: ${attrition.completersN}/${attrition.startingN} completed; ` +
      `survivorship bias (completers − full) = ${fmt(attrition.survivorshipBias)}`,
  );

  return {
    cohortId,
    grade: "associational",
    n,
    meanGapChange: mean(changes),
    medianGapChange: quantile(ascending(changes), 0.5),
    distribution: distributionOf(changes),
    doseResponse: doseResponseOf(series, config.minN),
    attrition,
    regressionToMean,
    baseline,
    caveats,
  };
}

// --- Quasi-experimental hook: staggered rollout ------------------------------

export interface StaggeredComparison {
  grade: EvidenceGrade;
  treatedCohortId: Id;
  controlCohortId: Id;
  /** treated − control mean gap-change; null when refused or insufficient. */
  difference: number | null;
  /** True only when the control is genuinely not-yet-treated at evaluation time. */
  valid: boolean;
  caveats: string[];
}

export interface StaggeredComparisonInput {
  treated: CohortEfficacyResult;
  treatedAssignment: CohortAssignment;
  control: CohortEfficacyResult;
  controlAssignment: CohortAssignment;
  evaluatedAt: Date;
}

/**
 * Between-cohort comparison for a staggered rollout. It earns the
 * `quasi_experimental` grade ONLY when the control cohort has not yet begun
 * treatment at evaluation time (a valid not-yet-treated comparison). Otherwise
 * it REFUSES the causal-adjacent claim and downgrades to `associational` with a
 * reason — never a control that isn't one.
 */
export function compareStaggered(
  input: StaggeredComparisonInput,
): StaggeredComparison {
  const { treated, control, treatedAssignment, controlAssignment, evaluatedAt } =
    input;
  const ids = {
    treatedCohortId: treated.cohortId,
    controlCohortId: control.cohortId,
  };

  if (treated.grade === "insufficient_n" || control.grade === "insufficient_n") {
    return {
      ...ids,
      grade: "insufficient_n",
      difference: null,
      valid: false,
      caveats: ["insufficient N in one or both arms; no comparison emitted"],
    };
  }

  const treatedStarted =
    treatedAssignment.startedAt.getTime() <= evaluatedAt.getTime();
  const controlNotYetTreated =
    controlAssignment.startedAt.getTime() > evaluatedAt.getTime();

  if (!treatedStarted || !controlNotYetTreated) {
    return {
      ...ids,
      grade: "associational",
      difference: null,
      valid: false,
      caveats: [
        "no valid not-yet-treated control at evaluation time; refusing the quasi-experimental claim, downgraded to associational",
      ],
    };
  }

  return {
    ...ids,
    grade: "quasi_experimental",
    difference:
      (treated.meanGapChange as number) - (control.meanGapChange as number),
    valid: true,
    caveats: [
      "staggered rollout: control is not-yet-treated at evaluation time; this between-cohort difference is quasi-experimental, still not a randomized control",
    ],
  };
}
