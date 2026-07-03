import {
  DomainError,
  assertPredictionPrecedesOutcome,
  computeCalibration,
  computeCongruence,
  createAffectSnapshot,
  createLearningGoal,
  createNextAction,
  createOutcome,
  createPrediction,
  createReflection,
  createTransferProbe,
  assessResponseQuality,
  granularity,
  hasScope,
  isProductiveAttribution,
  type AffectPhase,
  type AffectSnapshot,
  type Attribution,
  type CalibrationSummary,
  type Congruence,
  type EmotionLabel,
  type Id,
  type ItemOutcome,
  type ItemPrediction,
  type LearningGoal,
  type NextAction,
  type Outcome,
  type Prediction,
  type Reflection,
  type TransferProbe,
} from "@/domain";
import type {
  AffectRepository,
  AssessmentRepository,
  Clock,
  ConsentRepository,
  GoalRepository,
  IdGenerator,
  OutcomeRepository,
  PredictionRepository,
  ReflectionRepository,
  ResponseQualityRepository,
  TransferProbeRepository,
} from "@/domain/ports";
import {
  AffectConsentError,
  EmptyAffectError,
  ItemCoverageError,
  NonProductiveAttributionError,
  NotFoundError,
  PredictionAfterOutcomeError,
} from "./errors";

/**
 * Application services — they ENACT the self-regulated-learning cycle:
 *   captureGoal (forethought) → capturePrediction (monitoring) →
 *   recordOutcome + computeGap (feed-back) → captureAffect + submitReflection
 *   (self-reflection) → commitNextAction (feed-forward).
 *
 * Services depend ONLY on port interfaces (never concrete adapters) plus an
 * injected Clock and IdGenerator — so there is no `Date.now()`/randomness here.
 * All boundary inputs are validated through the domain factories (P2 Zod
 * schemas); invariant failures surface as the typed errors in ./errors.
 */

export interface ServiceDeps {
  clock: Clock;
  ids: IdGenerator;
  assessments: AssessmentRepository;
  goals: GoalRepository;
  predictions: PredictionRepository;
  outcomes: OutcomeRepository;
  reflections: ReflectionRepository;
  transferProbes: TransferProbeRepository;
  affects: AffectRepository;
  /**
   * Consent gate for affect capture (P12). When provided, affect capture refuses
   * unless the affect scope is granted. Omitting it preserves pre-P12 behavior.
   */
  consent?: ConsentRepository;
  /**
   * Response-quality quarantine (P15, honesty architecture). When provided, a
   * capture session is assessed for low-quality signals and recorded. Omitting it
   * preserves pre-P15 behavior; the quarantine never confronts or blocks capture.
   */
  responseQuality?: ResponseQualityRepository;
}

export interface CaptureGoalInput {
  studentId: Id;
  assessmentId: Id;
  targetScore: number;
  whyItMatters: string;
  successCriteriaRef?: string;
}

export interface CapturePredictionInput {
  studentId: Id;
  assessmentId: Id;
  itemPredictions: ItemPrediction[];
  globalPredicted: number;
  /**
   * Per-screen response times in ms, in screen order (P15 quality signal). The
   * surface may supply these; absent, the latency signal simply doesn't fire.
   */
  screenLatenciesMs?: number[];
}

export interface RecordOutcomeInput {
  studentId: Id;
  assessmentId: Id;
  itemOutcomes: ItemOutcome[];
}

export interface CaptureAffectInput {
  studentId: Id;
  assessmentId: Id;
  labels: EmotionLabel[];
  phase: AffectPhase;
}

export interface CaptureAffectResult {
  snapshot: AffectSnapshot;
  granularity: number;
}

export interface SubmitReflectionInput {
  studentId: Id;
  assessmentId: Id;
  attribution: Attribution;
  nextAction: NextAction;
  exemplarReviewed: boolean;
}

export interface ServeTransferProbeInput {
  assessmentId: Id;
  skillId: Id;
  itemId: Id;
}

export interface ProbeResult {
  probe: TransferProbe;
  correct: boolean;
}

/**
 * The GAP result. `congruence` is null when there is no goal (never guess the
 * student's target) or no post-evidence affect — calibration is still returned.
 */
export interface GapResult {
  calibration: CalibrationSummary;
  congruence: Congruence | null;
  /** Granularity of the post-evidence snapshot used, or null if none. */
  granularity: number | null;
}

export interface Services {
  captureGoal(input: CaptureGoalInput): Promise<LearningGoal>;
  capturePrediction(input: CapturePredictionInput): Promise<Prediction>;
  recordOutcome(input: RecordOutcomeInput): Promise<Outcome>;
  computeGap(assessmentId: Id, studentId: Id): Promise<GapResult>;
  captureAffect(input: CaptureAffectInput): Promise<CaptureAffectResult>;
  submitReflection(input: SubmitReflectionInput): Promise<Reflection>;
  commitNextAction(
    reflectionId: Id,
    nextAction: NextAction,
  ): Promise<Reflection>;
  serveTransferProbe(input: ServeTransferProbeInput): Promise<TransferProbe>;
  recordProbeResult(probeId: Id, correct: boolean): Promise<ProbeResult>;
}

export function createServices(deps: ServiceDeps): Services {
  const { clock, ids } = deps;

  async function captureGoal(input: CaptureGoalInput): Promise<LearningGoal> {
    const goal = createLearningGoal({
      id: ids.next("goal"),
      studentId: input.studentId,
      assessmentId: input.assessmentId,
      targetScore: input.targetScore,
      whyItMatters: input.whyItMatters,
      successCriteriaRef: input.successCriteriaRef,
      createdAt: clock.now(),
    });
    await deps.goals.save(goal);
    return goal;
  }

  async function capturePrediction(
    input: CapturePredictionInput,
  ): Promise<Prediction> {
    const assessment = await deps.assessments.findById(input.assessmentId);
    if (assessment === null) {
      throw new NotFoundError(`assessment ${input.assessmentId}`);
    }

    const required = new Set(assessment.items.map((i) => i.id));
    const provided = new Set(input.itemPredictions.map((p) => p.itemId));
    const missing = [...required].filter((id) => !provided.has(id));
    const extra = [...provided].filter((id) => !required.has(id));
    const duplicated = input.itemPredictions.length !== provided.size;
    if (missing.length > 0 || extra.length > 0 || duplicated) {
      throw new ItemCoverageError(missing, extra, duplicated);
    }

    const prediction = createPrediction({
      id: ids.next("pred"),
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      itemPredictions: input.itemPredictions,
      globalPredicted: input.globalPredicted,
      createdAt: clock.now(),
    });
    await deps.predictions.save(prediction);

    // P15: assess and record this session's response quality. A quarantined
    // session is excluded from metrics downstream; capture is never blocked and
    // the student is never told (docs/honesty-and-data-integrity.md).
    if (deps.responseQuality !== undefined) {
      const quality = assessResponseQuality({
        sessionId: prediction.id,
        studentId: input.studentId,
        at: clock.now(),
        confidences: input.itemPredictions.map((p) => p.confidence),
        screenLatenciesMs: input.screenLatenciesMs,
      });
      await deps.responseQuality.save(quality);
    }

    return prediction;
  }

  async function recordOutcome(input: RecordOutcomeInput): Promise<Outcome> {
    const outcome = createOutcome({
      id: ids.next("out"),
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      itemOutcomes: input.itemOutcomes,
      scoredAt: clock.now(),
    });

    const prediction = await deps.predictions.findByAssessmentAndStudent(
      input.assessmentId,
      input.studentId,
    );
    if (prediction === null) {
      throw new NotFoundError(
        `prediction for assessment ${input.assessmentId} / student ${input.studentId}`,
      );
    }

    try {
      assertPredictionPrecedesOutcome(prediction, outcome);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new PredictionAfterOutcomeError(error.message);
      }
      throw error;
    }

    await deps.outcomes.save(outcome);
    return outcome;
  }

  async function computeGap(
    assessmentId: Id,
    studentId: Id,
  ): Promise<GapResult> {
    const prediction = await deps.predictions.findByAssessmentAndStudent(
      assessmentId,
      studentId,
    );
    const outcome = await deps.outcomes.findByAssessmentAndStudent(
      assessmentId,
      studentId,
    );
    if (prediction === null || outcome === null) {
      throw new NotFoundError(
        `prediction+outcome for assessment ${assessmentId} / student ${studentId}`,
      );
    }

    const calibration = computeCalibration(prediction, outcome);

    const goal =
      (await deps.goals.listByStudent(studentId))
        .filter((g) => g.assessmentId === assessmentId)
        .at(-1) ?? null;

    const post =
      (await deps.affects.listByAssessmentAndStudent(assessmentId, studentId))
        .filter((a) => a.phase === "post_evidence")
        .at(-1) ?? null;

    const congruence =
      goal !== null && post !== null
        ? computeCongruence(post, outcome, goal)
        : null;

    return {
      calibration,
      congruence,
      granularity: post !== null ? granularity(post.labels) : null,
    };
  }

  async function captureAffect(
    input: CaptureAffectInput,
  ): Promise<CaptureAffectResult> {
    if (input.labels.length === 0) {
      throw new EmptyAffectError();
    }
    // P12 consent gate: affect may not be captured without a granted affect scope.
    if (deps.consent !== undefined) {
      const records = await deps.consent.listByStudent(input.studentId);
      if (!hasScope(records, "affect")) {
        throw new AffectConsentError(input.studentId);
      }
    }
    const snapshot = createAffectSnapshot({
      id: ids.next("aff"),
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      labels: input.labels,
      phase: input.phase,
      createdAt: clock.now(),
    });
    await deps.affects.save(snapshot);
    return { snapshot, granularity: granularity(snapshot.labels) };
  }

  async function submitReflection(
    input: SubmitReflectionInput,
  ): Promise<Reflection> {
    if (!isProductiveAttribution(input.attribution)) {
      throw new NonProductiveAttributionError();
    }
    const reflection = createReflection({
      id: ids.next("ref"),
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      attribution: input.attribution,
      nextAction: input.nextAction,
      exemplarReviewed: input.exemplarReviewed,
      createdAt: clock.now(),
    });
    await deps.reflections.save(reflection);
    return reflection;
  }

  async function commitNextAction(
    reflectionId: Id,
    nextAction: NextAction,
  ): Promise<Reflection> {
    const existing = await deps.reflections.findById(reflectionId);
    if (existing === null) {
      throw new NotFoundError(`reflection ${reflectionId}`);
    }
    const validated = createNextAction(nextAction);
    const updated = createReflection({ ...existing, nextAction: validated });
    await deps.reflections.save(updated);
    return updated;
  }

  async function serveTransferProbe(
    input: ServeTransferProbeInput,
  ): Promise<TransferProbe> {
    const probe = createTransferProbe({
      id: ids.next("probe"),
      assessmentId: input.assessmentId,
      skillId: input.skillId,
      itemId: input.itemId,
      createdAt: clock.now(),
    });
    await deps.transferProbes.save(probe);
    return probe;
  }

  async function recordProbeResult(
    probeId: Id,
    correct: boolean,
  ): Promise<ProbeResult> {
    const probe = await deps.transferProbes.findById(probeId);
    if (probe === null) {
      throw new NotFoundError(`transfer probe ${probeId}`);
    }
    return { probe, correct };
  }

  return {
    captureGoal,
    capturePrediction,
    recordOutcome,
    computeGap,
    captureAffect,
    submitReflection,
    commitNextAction,
    serveTransferProbe,
    recordProbeResult,
  };
}
