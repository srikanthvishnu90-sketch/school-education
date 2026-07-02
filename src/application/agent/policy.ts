import { isProductiveAttribution, type SkillCalibration } from "@/domain";
import type { AgentDecision, AgentObservation } from "./types";

/**
 * InterventionPolicy — a PURE, deterministic function: observation → decision.
 * There is no LLM, no clock, no I/O, no randomness in this path. Same
 * observation always yields the same decision.
 *
 * Priority order (first match wins), and WHY:
 *   1. non-productive reflection → require_redecomposition
 *        A stable/global cause ("I'm bad at math") is unactionable; fix the
 *        attribution before anything else.
 *   2. overconfident skill → serve_probe (+ surface exemplar)
 *        Academic overconfidence is the fluency illusion. Puncture it with a
 *        fresh probe FIRST — this is why this rank sits above build_granularity:
 *        when a student is both academically overconfident AND emotionally
 *        over-positive, the probe surfaces the reality that makes any later
 *        emotional work honest. (build_granularity below handles the purely
 *        emotional case, where calibration is fine.)
 *   3. over_positive congruence + low granularity → build_granularity
 *   4. displayed misconception → surface_exemplar
 *   5. action past dueBy → check_action_followthrough
 *   6. persistent / severe gap → flag_to_teacher (teacher as ally, not a report)
 *   7. else → schedule_reengagement
 */

export const POLICY_EPS = 0.1;
export const LOW_GRANULARITY_MAX = 1;
export const PERSISTENT_GAP_MIN = 2;
export const SEVERE_GLOBAL_GAP = 0.9;

/** The overconfident skill with the largest positive bias, or null if none. */
export function worstOverconfidentSkill(
  perSkill: readonly SkillCalibration[],
  eps: number = POLICY_EPS,
): SkillCalibration | null {
  let worst: SkillCalibration | null = null;
  for (const skill of perSkill) {
    if (skill.bias !== null && skill.bias > eps) {
      if (worst === null || skill.bias > (worst.bias as number)) {
        worst = skill;
      }
    }
  }
  return worst;
}

export function interventionPolicy(
  observation: AgentObservation,
): AgentDecision {
  // 1. Non-productive reflection — must be re-decomposed to a controllable cause.
  if (
    observation.reflection !== null &&
    !isProductiveAttribution(observation.reflection.attribution)
  ) {
    return {
      intervention: "require_redecomposition",
      rationale:
        "attribution is stable/global (not specific+controllable); re-decompose to a controllable cause",
    };
  }

  // 2. Academic overconfidence — puncture the fluency illusion with a probe.
  const worst = worstOverconfidentSkill(observation.perSkill);
  if (worst !== null) {
    return {
      intervention: "serve_probe",
      targetSkillId: worst.skillId,
      rationale: `overconfident on ${worst.skillId} (bias ${(worst.bias as number).toFixed(2)}); serve a transfer probe and surface a correct exemplar`,
    };
  }

  // 3. Purely emotional over-positivity with an undifferentiated feeling.
  if (
    observation.congruence?.classification === "over_positive" &&
    observation.granularity !== null &&
    observation.granularity <= LOW_GRANULARITY_MAX
  ) {
    return {
      intervention: "build_granularity",
      rationale:
        "over_positive congruence with low granularity; help differentiate the feeling",
    };
  }

  // 4. A known misconception surfaced on a missed item.
  if (observation.displayedMisconception) {
    return {
      intervention: "surface_exemplar",
      rationale: "a tagged misconception showed on a missed item; surface a correct exemplar",
    };
  }

  // 5. The committed next action is overdue.
  if (observation.action?.overdue === true) {
    return {
      intervention: "check_action_followthrough",
      rationale: "committed next action is past its dueBy; check follow-through",
    };
  }

  // 6. Persistent or severe gap — route help through the teacher (as an ally).
  const severe =
    observation.calibration.globalGap !== null &&
    Math.abs(observation.calibration.globalGap) >= SEVERE_GLOBAL_GAP;
  if (observation.priorGapCount >= PERSISTENT_GAP_MIN || severe) {
    return {
      intervention: "flag_to_teacher",
      rationale:
        "persistent or severe belief↔reality gap; involve the teacher as an ally (support, not surveillance)",
    };
  }

  // 7. Nothing acute — keep the loop warm.
  return {
    intervention: "schedule_reengagement",
    rationale: "no acute gap; schedule a low-stakes re-engagement",
  };
}
