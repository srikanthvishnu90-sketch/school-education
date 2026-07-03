import {
  DEFAULT_COHORT_CONFIG,
  analyzeCohort,
  compareStaggered,
  granularity,
  type CohortAnalysisConfig,
  type CohortAssignment,
  type CohortEfficacyResult,
  type CohortWindow,
  type Id,
  type StaggeredComparison,
  type StudentGapSeries,
} from "@/domain";
import type {
  ActionVerificationRepository,
  AffectRepository,
  CalibrationRepository,
  Clock,
} from "@/domain/ports";

/**
 * EfficacyService — assembles cohort efficacy reports from per-student P7/P3
 * artifacts and caps every claim at the design that actually exists. It reads
 * repositories, derives each student's calibration-gap trajectory, and hands
 * clean series to the pure aggregation. It NEVER manufactures a control: a lone
 * cohort report is associational; a staggered comparison earns
 * `quasi_experimental` only when a genuine not-yet-treated control exists at the
 * injected clock's evaluation time.
 *
 * Deterministic: the only non-pure input is the injected clock (evaluation time
 * for the staggered comparison). No LLM anywhere.
 */

export interface EfficacyServiceDeps {
  clock: Clock;
  calibrations: CalibrationRepository;
  verifications: ActionVerificationRepository;
  affects: AffectRepository;
  config?: CohortAnalysisConfig;
  /**
   * A student counts as a completer if still active past this fraction of the
   * window (their last observation lands in the tail). Default 0.5.
   */
  completionFraction?: number;
}

export interface EfficacyService {
  cohortReport(window: CohortWindow): Promise<CohortEfficacyResult>;
  compareStaggeredCohorts(
    treated: { window: CohortWindow; assignment: CohortAssignment },
    control: { window: CohortWindow; assignment: CohortAssignment },
  ): Promise<StaggeredComparison>;
}

export function createEfficacyService(
  deps: EfficacyServiceDeps,
): EfficacyService {
  const config = deps.config ?? DEFAULT_COHORT_CONFIG;
  const completionFraction = deps.completionFraction ?? 0.5;

  function within(at: Date, window: CohortWindow): boolean {
    const t = at.getTime();
    return t >= window.from.getTime() && t <= window.to.getTime();
  }

  async function entryGranularity(
    studentId: Id,
    window: CohortWindow,
  ): Promise<number> {
    const snapshots = (await deps.affects.listByStudent(studentId))
      .filter((s) => s.phase === "post_evidence" && within(s.createdAt, window))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return snapshots.length > 0 ? granularity(snapshots[0].labels) : 0;
  }

  async function seriesFor(
    studentId: Id,
    window: CohortWindow,
  ): Promise<StudentGapSeries | null> {
    const records = (await deps.calibrations.listByStudent(studentId))
      .filter((r) => within(r.computedAt, window))
      .sort((a, b) => a.computedAt.getTime() - b.computedAt.getTime());
    if (records.length === 0) return null; // never entered the window

    // The calibration gap is |bias| (over/under-confidence), lower = better.
    const gaps = records.map((r) => Math.abs(r.bias));
    const cyclesCompleted = (await deps.verifications.listByStudent(studentId))
      .filter((v) => v.closedAt !== undefined && within(v.openedAt, window))
      .length;

    const completionCutoff =
      window.from.getTime() +
      (window.to.getTime() - window.from.getTime()) * completionFraction;
    const lastAt = records[records.length - 1].computedAt.getTime();

    return {
      studentId,
      gaps,
      cyclesCompleted,
      completed: lastAt >= completionCutoff,
      entryGranularity: await entryGranularity(studentId, window),
    };
  }

  async function assemble(
    window: CohortWindow,
  ): Promise<StudentGapSeries[]> {
    const series: StudentGapSeries[] = [];
    for (const studentId of window.studentIds) {
      const s = await seriesFor(studentId, window);
      if (s !== null) series.push(s);
    }
    return series;
  }

  async function cohortReport(
    window: CohortWindow,
  ): Promise<CohortEfficacyResult> {
    return analyzeCohort(window.cohortId, await assemble(window), config);
  }

  async function compareStaggeredCohorts(
    treated: { window: CohortWindow; assignment: CohortAssignment },
    control: { window: CohortWindow; assignment: CohortAssignment },
  ): Promise<StaggeredComparison> {
    const [treatedResult, controlResult] = await Promise.all([
      cohortReport(treated.window),
      cohortReport(control.window),
    ]);
    return compareStaggered({
      treated: treatedResult,
      treatedAssignment: treated.assignment,
      control: controlResult,
      controlAssignment: control.assignment,
      evaluatedAt: deps.clock.now(),
    });
  }

  return { cohortReport, compareStaggeredCohorts };
}
