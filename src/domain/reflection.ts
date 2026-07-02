import { DomainError, type Id } from "./common";
import {
  attributionSchema,
  nextActionSchema,
  reflectionSchema,
} from "./schemas/academic";

/**
 * Reflection → Zimmerman's self-reflection phase + Weiner's attribution theory.
 * A reflection is a CAUSE plus one concrete, dated next action.
 *
 * Product safety (CLAUDE.md): reflection must resolve to CONTROLLABLE + SPECIFIC
 * causes and steer away from stable/global ones ("I'm bad at math"). We encode
 * that as a hard invariant — a Reflection cannot be built on an unproductive
 * attribution. Feed-forward (`nextAction`) is the highest-value output.
 */

export type AttributionCategory =
  "strategy" | "effort_allocation" | "misconception" | "external" | "ability";

export interface Attribution {
  category: AttributionCategory;
  /** Specific to this work, not global ("this problem type" vs "math"). */
  specific: boolean;
  /** Within the student's control ("my strategy" vs "my ability"). */
  controllable: boolean;
  note: string;
}

export interface NextAction {
  text: string;
  dueBy: Date;
}

export interface Reflection {
  id: Id;
  assessmentId: Id;
  studentId: Id;
  attribution: Attribution;
  nextAction: NextAction;
  /**
   * Whether the student reviewed a CORRECT exemplar. Reflecting only on one's own
   * wrong answer can consolidate the misconception (Kluger & DeNisi).
   */
  exemplarReviewed: boolean;
  createdAt: Date;
}

/**
 * An attribution is productive iff it is both specific and controllable — the
 * only kind that yields an actionable next step. This is the single definition;
 * do not duplicate the boolean logic elsewhere.
 */
export function isProductiveAttribution(attribution: Attribution): boolean {
  return attribution.specific && attribution.controllable;
}

export function createAttribution(input: Attribution): Attribution {
  return Object.freeze(attributionSchema.parse(input));
}

export function createNextAction(input: NextAction): NextAction {
  return Object.freeze(nextActionSchema.parse(input));
}

/** Rejects a reflection whose attribution is not productive (specific + controllable). */
export function createReflection(input: Reflection): Reflection {
  const parsed = reflectionSchema.parse(input);
  if (!isProductiveAttribution(parsed.attribution)) {
    throw new DomainError(
      "reflection requires a productive attribution (specific AND controllable); " +
        "stable/global causes do not yield an actionable next step",
    );
  }
  return Object.freeze(parsed);
}
