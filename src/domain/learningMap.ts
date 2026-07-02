import type { Id } from "./common";
import { learningMapSchema, masteryBandSchema } from "./schemas/academic";

/**
 * The externalized skill progression a student locates themselves on. Adolescent
 * metacognition is variable, so the progression is made EXTERNAL and explicit
 * rather than assumed (CLAUDE.md → DEVELOPMENT). A `LearningMap` orders
 * `MasteryBand`s for a skill; the student's position is `currentBandId`.
 */

export interface MasteryBand {
  id: Id;
  skillId: Id;
  label: string;
  /** Position in the progression (lower = earlier). */
  order: number;
  descriptor: string;
}

export interface LearningMap {
  id: Id;
  skillId: Id;
  bands: MasteryBand[];
  studentId?: Id;
  currentBandId?: Id;
}

export function createMasteryBand(input: MasteryBand): MasteryBand {
  return Object.freeze(masteryBandSchema.parse(input));
}

export function createLearningMap(input: LearningMap): LearningMap {
  return Object.freeze(learningMapSchema.parse(input));
}
