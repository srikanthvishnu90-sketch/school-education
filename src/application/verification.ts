import {
  DEFAULT_VERIFICATION_CONFIG,
  createActionVerification,
  isStale,
  perSkill as computePerSkill,
  toSkillMeasure,
  verifyAction,
  type ActionVerification,
  type Id,
  type SkillDrift,
  type SkillMeasure,
  type VerificationConfig,
} from "@/domain";
import type {
  ActionVerificationRepository,
  AssessmentRepository,
  Clock,
  IdGenerator,
  OutcomeRepository,
  PredictionRepository,
} from "@/domain/ports";
import { NotFoundError } from "./errors";

/**
 * VerificationService — closes the loop from the agent's side. When a next action
 * that targets a skill is committed, it OPENS a verification against the skill's
 * current measure. When new evidence lands, it BINDS the first later assessment
 * that actually measures that skill (skipping assessments that don't), computes
 * the accuracy and calibration verdicts SEPARATELY, and expires any verification
 * whose re-test window has elapsed as `inconclusive` (never a false verdict).
 *
 * Everything nondeterministic is injected (clock, ids); there is no LLM anywhere
 * in this path. The verdict math lives in the pure P7 domain; this service only
 * SELECTS the follow-up and persists.
 */

export interface VerificationServiceDeps {
  clock: Clock;
  ids: IdGenerator;
  assessments: AssessmentRepository;
  predictions: PredictionRepository;
  outcomes: OutcomeRepository;
  verifications: ActionVerificationRepository;
  /** Thresholds + staleness horizon. Defaults to DEFAULT_VERIFICATION_CONFIG. */
  config?: VerificationConfig;
}

export interface OpenForActionInput {
  /** The reflection whose one committed next action is being verified. */
  nextActionId: Id;
  studentId: Id;
  targetSkillId: Id;
  /** The assessment that revealed the gap and set the baseline. */
  baselineAssessmentId: Id;
}

export interface VerificationService {
  openForAction(input: OpenForActionInput): Promise<ActionVerification>;
  onNewEvidence(
    assessmentId: Id,
    studentId: Id,
  ): Promise<ActionVerification[]>;
}

export function createVerificationService(
  deps: VerificationServiceDeps,
): VerificationService {
  const { clock, ids } = deps;
  const config = deps.config ?? DEFAULT_VERIFICATION_CONFIG;

  /**
   * Every P6-eligible per-skill measure for one student on one assessment
   * (skillId → measure). A skill with no matched predicted+scored items simply
   * does not appear — that absence is how "this assessment does not contain the
   * skill" is expressed.
   */
  async function measureAssessment(
    assessmentId: Id,
    studentId: Id,
  ): Promise<Map<Id, SkillMeasure>> {
    const measures = new Map<Id, SkillMeasure>();
    const assessment = await deps.assessments.findById(assessmentId);
    if (assessment === null) return measures;
    const prediction = await deps.predictions.findByAssessmentAndStudent(
      assessmentId,
      studentId,
    );
    const outcome = await deps.outcomes.findByAssessmentAndStudent(
      assessmentId,
      studentId,
    );
    if (prediction === null || outcome === null) return measures;

    for (const sc of computePerSkill(prediction, outcome, assessment.items)) {
      const measure = toSkillMeasure(sc);
      if (measure !== null) measures.set(measure.skillId, measure);
    }
    return measures;
  }

  async function openForAction(
    input: OpenForActionInput,
  ): Promise<ActionVerification> {
    const measures = await measureAssessment(
      input.baselineAssessmentId,
      input.studentId,
    );
    const baseline = measures.get(input.targetSkillId);
    if (baseline === undefined) {
      throw new NotFoundError(
        `baseline measure of skill ${input.targetSkillId} on assessment ${input.baselineAssessmentId} for student ${input.studentId}`,
      );
    }

    const verification = createActionVerification({
      id: ids.next("verif"),
      nextActionId: input.nextActionId,
      studentId: input.studentId,
      targetSkillId: input.targetSkillId,
      openedAt: clock.now(),
      baseline,
      baselineAssessmentId: input.baselineAssessmentId,
      accuracyVerdict: "pending",
      calibrationVerdict: "pending",
    });
    await deps.verifications.save(verification);
    return verification;
  }

  async function onNewEvidence(
    assessmentId: Id,
    studentId: Id,
  ): Promise<ActionVerification[]> {
    const open = (await deps.verifications.listByStudent(studentId)).filter(
      (v) => v.closedAt === undefined,
    );
    if (open.length === 0) return [];

    const now = clock.now();
    const measures = await measureAssessment(assessmentId, studentId);
    const touched: ActionVerification[] = [];

    for (const verification of open) {
      const stale = isStale(verification, now, config);
      const followup =
        assessmentId === verification.baselineAssessmentId
          ? undefined
          : measures.get(verification.targetSkillId);

      // A valid follow-up that lands AFTER the horizon is deliberately NOT bound
      // (the `!stale` conjunct): a re-test 31 days on is no longer trustworthy
      // evidence FOR this action, so it expires as inconclusive below rather than
      // crediting/faulting the action on stale evidence. This is intentional —
      // do not "fix" it into a bind.
      if (followup !== undefined && !stale) {
        // The confound guard is structural: verifyAction only ever sees the
        // TARGET skill. Other skills that moved this cycle are logged as drift,
        // never credited to the action.
        const { accuracyVerdict, calibrationVerdict } = verifyAction(
          verification.baseline,
          followup,
          config,
        );
        const drift: SkillDrift[] = [...measures.values()]
          .filter((m) => m.skillId !== verification.targetSkillId)
          .map((m) => ({ skillId: m.skillId, accuracy: m.accuracy }));

        const bound = createActionVerification({
          ...verification,
          followup,
          followupAssessmentId: assessmentId,
          accuracyVerdict,
          calibrationVerdict,
          untargetedDrift: drift.length > 0 ? drift : undefined,
          closedAt: now,
        });
        await deps.verifications.save(bound);
        touched.push(bound);
        continue;
      }

      // No re-test of the skill within the window → expire as inconclusive.
      if (stale) {
        const expired = createActionVerification({
          ...verification,
          accuracyVerdict: "inconclusive",
          calibrationVerdict: "inconclusive",
          closedAt: now,
        });
        await deps.verifications.save(expired);
        touched.push(expired);
      }
      // Otherwise: not measured here, window still open → leave it open.
    }

    return touched;
  }

  return { openForAction, onNewEvidence };
}

/**
 * Skills a student has REPEATEDLY regressed on across closed verifications — the
 * signal the policy uses to change tack instead of re-serving the same probe.
 * Only the accuracy verdict counts (did the skill actually move); a skill needs
 * at least `min` regressed verdicts to escalate.
 */
export function repeatedlyRegressedSkills(
  verifications: readonly ActionVerification[],
  min: number,
): Id[] {
  const counts = new Map<Id, number>();
  for (const v of verifications) {
    if (v.accuracyVerdict === "regressed") {
      counts.set(v.targetSkillId, (counts.get(v.targetSkillId) ?? 0) + 1);
    }
  }
  const order: Id[] = [];
  for (const v of verifications) {
    const skillId = v.targetSkillId;
    if ((counts.get(skillId) ?? 0) >= min && !order.includes(skillId)) {
      order.push(skillId);
    }
  }
  return order;
}
