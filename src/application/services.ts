import {
  createAffectSnapshot,
  createLearningGoal,
  createNextAction,
  createOutcome,
  createReflection,
  createTransferProbe,
  granularity,
  hasScope,
  isProductiveAttribution,
  type AffectPhase,
  type AffectSnapshot,
  type Attribution,
  type EmotionLabel,
  type Id,
  type ItemOutcome,
  type LearningGoal,
  type NextAction,
  type Outcome,
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
  ReflectionRepository,
  TransferProbeRepository,
} from "@/domain/ports";
import {
  AffectConsentError,
  EmptyAffectError,
  NonProductiveAttributionError,
  NotFoundError,
} from "./errors";

/**
 * Application services — they ENACT the self-regulated-learning cycle:
 *   captureGoal (forethought) → recordOutcome (feed-back) →
 *   captureAffect + submitReflection (self-reflection) →
 *   commitNextAction (feed-forward).
 *
 * The pre-assessment/prediction mechanic (and the calibration/gap it fed) was
 * retired; outcomes are recorded directly, and reflection now runs through the
 * intelligence subsystem. Services depend ONLY on port interfaces (never concrete
 * adapters) plus an injected Clock and IdGenerator — so there is no
 * `Date.now()`/randomness here. All boundary inputs are validated through the
 * domain factories (P2 Zod schemas); invariant failures surface as the typed
 * errors in ./errors.
 */

export interface ServiceDeps {
  clock: Clock;
  ids: IdGenerator;
  assessments: AssessmentRepository;
  goals: GoalRepository;
  outcomes: OutcomeRepository;
  reflections: ReflectionRepository;
  transferProbes: TransferProbeRepository;
  affects: AffectRepository;
  /**
   * Consent gate for affect capture (P12). When provided, affect capture refuses
   * unless the affect scope is granted. Omitting it preserves pre-P12 behavior.
   */
  consent?: ConsentRepository;
}

export interface CaptureGoalInput {
  studentId: Id;
  assessmentId: Id;
  targetScore: number;
  whyItMatters: string;
  successCriteriaRef?: string;
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

export interface Services {
  captureGoal(input: CaptureGoalInput): Promise<LearningGoal>;
  recordOutcome(input: RecordOutcomeInput): Promise<Outcome>;
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

  async function recordOutcome(input: RecordOutcomeInput): Promise<Outcome> {
    const outcome = createOutcome({
      id: ids.next("out"),
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      itemOutcomes: input.itemOutcomes,
      scoredAt: clock.now(),
    });
    await deps.outcomes.save(outcome);
    return outcome;
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
    recordOutcome,
    captureAffect,
    submitReflection,
    commitNextAction,
    serveTransferProbe,
    recordProbeResult,
  };
}
