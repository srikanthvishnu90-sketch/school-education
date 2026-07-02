import type { Id } from "./common";
import {
  assessmentItemSchema,
  assessmentSchema,
  misconceptionSchema,
  skillSchema,
} from "./schemas/academic";

/**
 * The skill/assessment structure the calibration loop hangs on. A `Skill` is the
 * unit of competence a `LearningMap` charts; a `Misconception` is a known wrong
 * model of a skill (used later to reflect against a CORRECT exemplar, per
 * CLAUDE.md → SAFETY). An `Assessment` is a set of `AssessmentItem`s.
 */

export interface Skill {
  id: Id;
  name: string;
  description?: string;
}

export interface Misconception {
  id: Id;
  skillId: Id;
  description: string;
}

export interface AssessmentItem {
  id: Id;
  assessmentId: Id;
  skillId: Id;
  prompt: string;
  /** Maximum points the item is worth; must be > 0. */
  maxPoints: number;
  misconceptionIds?: Id[];
}

export interface Assessment {
  id: Id;
  title: string;
  items: AssessmentItem[];
  createdAt: Date;
}

export function createSkill(input: Skill): Skill {
  return Object.freeze(skillSchema.parse(input));
}

export function createMisconception(input: Misconception): Misconception {
  return Object.freeze(misconceptionSchema.parse(input));
}

export function createAssessmentItem(input: AssessmentItem): AssessmentItem {
  return Object.freeze(assessmentItemSchema.parse(input));
}

export function createAssessment(input: Assessment): Assessment {
  return Object.freeze(assessmentSchema.parse(input));
}
