import {
  flagIdFor,
  perSkill as computePerSkill,
  type ActionVerification,
  type Id,
  type SkillCalibration,
} from "@/domain";
import type {
  ActionVerificationRepository,
  AssessmentRepository,
  Clock,
  FlagAcknowledgementRepository,
  OutcomeRepository,
  PredictionRepository,
} from "@/domain/ports";
import { interventionPolicy } from "./agent";
import type { Observer } from "./agent";

/**
 * The teacher surface's data — an instructional signal, never surveillance. It
 * reads ONLY academic aggregates and agent flags: class-mean calibration per
 * skill, follow-through counts, and the severe/persistent flags the agent raised.
 * It never touches affect, reflection text, or a single student's row for
 * browsing. Below a minimum N a skill shows no estimate (mirrors P9).
 */

export interface SkillCalibrationRow {
  skillId: Id;
  skillName: string;
  n: number;
  /** class-mean (meanConfidence − accuracy); null below min-N. */
  meanBias: number | null;
  meanAccuracy: number | null;
  sufficient: boolean;
}

export interface FollowThrough {
  total: number;
  /** % of verifications that reached a real verdict this window; null if none. */
  resolvedPct: number | null;
  improved: number;
  flat: number;
  regressed: number;
}

export interface TeacherFlag {
  flagId: Id;
  studentId: Id;
  skillId: Id | null;
  skillName: string | null;
  /** The calibration pattern in TASK language — about the work, never the child. */
  pattern: string;
  suggestedMove: "probe" | "exemplar";
}

export interface ClassSignals {
  calibration: SkillCalibrationRow[];
  followThrough: FollowThrough;
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

interface Contribution {
  skillId: Id;
  bias: number;
  accuracy: number;
}

/** Aggregates per-student per-skill calibration into the class heat-list. */
export function aggregateCalibration(
  contributions: readonly Contribution[],
  skillNames: Record<Id, string>,
  minN: number,
): SkillCalibrationRow[] {
  const bySkill = new Map<Id, Contribution[]>();
  const order: Id[] = [];
  for (const c of contributions) {
    if (!bySkill.has(c.skillId)) {
      bySkill.set(c.skillId, []);
      order.push(c.skillId);
    }
    bySkill.get(c.skillId)!.push(c);
  }

  const rows = order.map((skillId): SkillCalibrationRow => {
    const list = bySkill.get(skillId)!;
    const sufficient = list.length >= minN;
    return {
      skillId,
      skillName: skillNames[skillId] ?? skillId,
      n: list.length,
      meanBias: sufficient ? mean(list.map((c) => c.bias)) : null,
      meanAccuracy: sufficient ? mean(list.map((c) => c.accuracy)) : null,
      sufficient,
    };
  });

  // Most blindsided first: largest |mean bias|; insufficient rows sort last.
  return rows.sort((a, b) => {
    if (a.meanBias === null && b.meanBias === null) return 0;
    if (a.meanBias === null) return 1;
    if (b.meanBias === null) return -1;
    return Math.abs(b.meanBias) - Math.abs(a.meanBias);
  });
}

/** Aggregates verification (P7) resolution — follow-through, no names. */
export function aggregateFollowThrough(
  verifications: readonly ActionVerification[],
): FollowThrough {
  const total = verifications.length;
  let improved = 0;
  let flat = 0;
  let regressed = 0;
  for (const v of verifications) {
    if (v.accuracyVerdict === "improved") improved += 1;
    else if (v.accuracyVerdict === "flat") flat += 1;
    else if (v.accuracyVerdict === "regressed") regressed += 1;
  }
  const resolved = improved + flat + regressed;
  return {
    total,
    resolvedPct: total === 0 ? null : Math.round((resolved / total) * 100),
    improved,
    flat,
    regressed,
  };
}

/** The flag's pattern in task language — about the work, not the child. */
export function flagPattern(skillName: string, bias: number): string {
  const direction = bias > 0 ? "ran ahead of the results" : "fell behind the results";
  return `Confidence and results are far apart on ${skillName}. Confidence ${direction}.`;
}

// --- The service -------------------------------------------------------------

export interface TeacherServiceDeps {
  assessments: AssessmentRepository;
  predictions: PredictionRepository;
  outcomes: OutcomeRepository;
  verifications: ActionVerificationRepository;
  flagAcks: FlagAcknowledgementRepository;
  observer: Observer;
  clock: Clock;
  skillNames: Record<Id, string>;
  minN: number;
}

export interface TeacherService {
  classSignals(assessmentIds: Id[], studentIds: Id[]): Promise<ClassSignals>;
  flags(assessmentId: Id, studentIds: Id[]): Promise<TeacherFlag[]>;
  acknowledge(studentId: Id, teacherId: Id): Promise<void>;
}

export function createTeacherService(deps: TeacherServiceDeps): TeacherService {
  return {
    async classSignals(assessmentIds, studentIds) {
      const contributions: Contribution[] = [];
      const verifications: ActionVerification[] = [];

      for (const studentId of studentIds) {
        verifications.push(
          ...(await deps.verifications.listByStudent(studentId)),
        );
        for (const assessmentId of assessmentIds) {
          const prediction =
            await deps.predictions.findByAssessmentAndStudent(
              assessmentId,
              studentId,
            );
          const outcome = await deps.outcomes.findByAssessmentAndStudent(
            assessmentId,
            studentId,
          );
          const assessment = await deps.assessments.findById(assessmentId);
          if (prediction === null || outcome === null || assessment === null) {
            continue;
          }
          for (const s of computePerSkill(prediction, outcome, assessment.items)) {
            if (s.bias !== null && s.accuracy !== null) {
              contributions.push({
                skillId: s.skillId,
                bias: s.bias,
                accuracy: s.accuracy,
              });
            }
          }
        }
      }

      return {
        calibration: aggregateCalibration(
          contributions,
          deps.skillNames,
          deps.minN,
        ),
        followThrough: aggregateFollowThrough(verifications),
      };
    },

    async flags(assessmentId, studentIds) {
      const out: TeacherFlag[] = [];
      for (const studentId of studentIds) {
        const observation = await deps.observer.observe(assessmentId, studentId);
        const decision = interventionPolicy(observation);
        if (decision.intervention !== "flag_to_teacher") continue;

        const skillId = decision.targetSkillId ?? null;
        const skill: SkillCalibration | undefined = observation.perSkill.find(
          (s) => s.skillId === skillId,
        );
        const bias = skill?.bias ?? observation.calibration.globalGap ?? 0;
        const skillName = skillId !== null ? deps.skillNames[skillId] ?? skillId : null;
        out.push({
          flagId: flagIdFor(studentId),
          studentId,
          skillId,
          skillName,
          pattern: flagPattern(skillName ?? "this work", bias),
          suggestedMove: bias > 0 ? "probe" : "exemplar",
        });
      }
      return out;
    },

    async acknowledge(studentId, teacherId) {
      await deps.flagAcks.save({
        flagId: flagIdFor(studentId),
        teacherId,
        at: deps.clock.now(),
      });
    },
  };
}
