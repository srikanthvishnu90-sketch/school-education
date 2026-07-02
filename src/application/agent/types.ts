import type {
  CalibrationSummary,
  Congruence,
  Id,
  Reflection,
  SkillCalibration,
} from "@/domain";

/**
 * The intervention agent's vocabulary. Every intervention acts on the STUDENT's
 * learning (task/process focused). `flag_to_teacher` is help routed to a teacher
 * as an ally — NOT a surveillance report (CLAUDE.md → SDT: controlling/monitoring
 * framing thwarts motivation).
 */
export type InterventionType =
  | "serve_probe"
  | "surface_exemplar"
  | "require_redecomposition"
  | "build_granularity"
  | "check_action_followthrough"
  | "flag_to_teacher"
  | "schedule_reengagement";

export interface ActionState {
  /** The committed next action's dueBy is in the past. */
  overdue: boolean;
}

/**
 * Everything the policy needs, assembled from both axes. A snapshot of the
 * student's belief↔reality gap — the policy is a pure function of this and
 * nothing else.
 */
export interface AgentObservation {
  assessmentId: Id;
  studentId: Id;
  calibration: CalibrationSummary;
  perSkill: SkillCalibration[];
  congruence: Congruence | null;
  granularity: number | null;
  reflection: Reflection | null;
  displayedMisconception: boolean;
  action: ActionState | null;
  /** How many prior assessments already showed a meaningful calibration gap. */
  priorGapCount: number;
}

export interface AgentDecision {
  intervention: InterventionType;
  targetSkillId?: Id;
  rationale: string;
}
