import {
  computeCalibration,
  computeCongruence,
  granularity,
  perSkill as computePerSkill,
} from "@/domain";
import type {
  ActionVerificationRepository,
  AffectRepository,
  AssessmentRepository,
  CalibrationRepository,
  Clock,
  FlagAcknowledgementRepository,
  GoalRepository,
  OutcomeRepository,
  PredictionRepository,
  ReflectionRepository,
  ResponseQualityRepository,
} from "@/domain/ports";
import { flagIdFor, type Id } from "@/domain";
import { NotFoundError } from "../errors";
import { repeatedlyRegressedSkills } from "../verification";
import { POLICY_EPS, REPEATED_REGRESSION_MIN } from "./policy";
import type { AgentObservation } from "./types";

/**
 * Assembles an AgentObservation from the repositories — the "observe" half of the
 * agent. It only READS (pure domain computations over stored data); it decides
 * nothing. The policy consumes what this produces.
 */

export interface ObserverDeps {
  clock: Clock;
  assessments: AssessmentRepository;
  predictions: PredictionRepository;
  outcomes: OutcomeRepository;
  goals: GoalRepository;
  affects: AffectRepository;
  reflections: ReflectionRepository;
  calibrations: CalibrationRepository;
  /** P7 verification history — optional so pre-P7 wirings still observe. */
  verifications?: ActionVerificationRepository;
  /** P13 teacher flag acknowledgements — optional so pre-P13 wirings still observe. */
  flagAcks?: FlagAcknowledgementRepository;
  /** P15 response-quality quarantine — optional so pre-P15 wirings still observe. */
  responseQuality?: ResponseQualityRepository;
}

export interface Observer {
  observe(assessmentId: Id, studentId: Id): Promise<AgentObservation>;
}

export function createObserver(deps: ObserverDeps): Observer {
  return {
    async observe(assessmentId, studentId) {
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

      const assessment = await deps.assessments.findById(assessmentId);
      const calibration = computeCalibration(prediction, outcome);
      const perSkill =
        assessment !== null
          ? computePerSkill(prediction, outcome, assessment.items)
          : [];

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

      const reflection =
        (await deps.reflections.listByStudent(studentId))
          .filter((r) => r.assessmentId === assessmentId)
          .at(-1) ?? null;

      const displayedMisconception =
        assessment !== null &&
        assessment.items.some(
          (item) =>
            (item.misconceptionIds?.length ?? 0) > 0 &&
            outcome.itemOutcomes.find((o) => o.itemId === item.id)?.correct ===
              false,
        );

      const action =
        reflection !== null
          ? {
              overdue:
                reflection.nextAction.dueBy.getTime() <
                deps.clock.now().getTime(),
            }
          : null;

      const priorGapCount = (
        await deps.calibrations.listByStudent(studentId)
      ).filter((c) => Math.abs(c.bias) > POLICY_EPS).length;

      const verificationEscalations =
        deps.verifications !== undefined
          ? repeatedlyRegressedSkills(
              await deps.verifications.listByStudent(studentId),
              REPEATED_REGRESSION_MIN,
            )
          : [];

      const teacherFlagAcknowledged =
        deps.flagAcks !== undefined &&
        (await deps.flagAcks.find(flagIdFor(studentId))) !== null;

      // P15: this session's quarantine, and how often this student has been
      // quarantined. Keyed by prediction id (the capture session id).
      let sessionQuarantined = false;
      let quarantineCount = 0;
      if (deps.responseQuality !== undefined) {
        sessionQuarantined =
          (await deps.responseQuality.findBySession(prediction.id))
            ?.quarantined === true;
        quarantineCount = (
          await deps.responseQuality.listByStudent(studentId)
        ).filter((q) => q.quarantined).length;
      }

      return {
        assessmentId,
        studentId,
        calibration,
        perSkill,
        congruence,
        granularity: post !== null ? granularity(post.labels) : null,
        reflection,
        displayedMisconception,
        action,
        priorGapCount,
        verificationEscalations,
        teacherFlagAcknowledged,
        sessionQuarantined,
        quarantineCount,
      };
    },
  };
}
