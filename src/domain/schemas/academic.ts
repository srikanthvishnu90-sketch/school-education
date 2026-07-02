import { z } from "zod";
import { idSchema, nonNegativeSchema, unitIntervalSchema } from "./common";

/**
 * Zod schemas for the ACADEMIC axis — the calibration loop: goal → prediction →
 * outcome → reflection, plus the skill/assessment structure they hang on.
 * Mirrors the interfaces in the sibling domain files 1:1 (compile-time enforced
 * by ../schemas/_typecheck.ts).
 */

// --- Skill structure ---------------------------------------------------------

export const skillSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const misconceptionSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  description: z.string().min(1),
});

export const assessmentItemSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  skillId: idSchema,
  prompt: z.string().min(1),
  maxPoints: nonNegativeSchema.refine((n) => n > 0, "maxPoints must be > 0"),
  misconceptionIds: z.array(idSchema).optional(),
});

export const assessmentSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  items: z.array(assessmentItemSchema),
  createdAt: z.date(),
});

// --- Goal (SDT autonomy + Hattie feed-up) ------------------------------------

export const learningGoalSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  assessmentId: idSchema,
  targetScore: unitIntervalSchema,
  whyItMatters: z.string().min(1),
  successCriteriaRef: z.string().min(1).optional(),
  createdAt: z.date(),
});

// --- Prediction (metacognitive monitoring, pre-registered) -------------------

export const itemPredictionSchema = z.object({
  itemId: idSchema,
  confidence: unitIntervalSchema,
});

export const predictionSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  studentId: idSchema,
  itemPredictions: z.array(itemPredictionSchema),
  globalPredicted: unitIntervalSchema,
  createdAt: z.date(),
});

// --- Outcome (revealed after prediction) -------------------------------------

export const itemOutcomeSchema = z.object({
  itemId: idSchema,
  correct: z.boolean(),
  pointsAwarded: nonNegativeSchema,
});

export const outcomeSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  studentId: idSchema,
  itemOutcomes: z.array(itemOutcomeSchema),
  scoredAt: z.date(),
});

// --- Reflection (Zimmerman self-reaction + Weiner attribution) ---------------

export const attributionCategorySchema = z.enum([
  "strategy",
  "effort_allocation",
  "misconception",
  "external",
  "ability",
]);

export const attributionSchema = z.object({
  category: attributionCategorySchema,
  specific: z.boolean(),
  controllable: z.boolean(),
  note: z.string().min(1),
});

export const nextActionSchema = z.object({
  text: z.string().min(1),
  dueBy: z.date(),
});

export const reflectionSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  studentId: idSchema,
  attribution: attributionSchema,
  nextAction: nextActionSchema,
  exemplarReviewed: z.boolean(),
  stale: z.boolean().optional(),
  createdAt: z.date(),
});

// --- Learning map (externalized progression to locate against) ---------------

export const masteryBandSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  label: z.string().min(1),
  order: z.number().int(),
  descriptor: z.string().min(1),
});

export const learningMapSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  bands: z.array(masteryBandSchema),
  studentId: idSchema.optional(),
  currentBandId: idSchema.optional(),
});

// --- Calibration record (shape only; the MATH is P3) -------------------------

export const calibrationRecordSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  studentId: idSchema,
  brier: z.number(),
  bias: z.number(),
  resolution: z.number(),
  itemCount: z.number().int().nonnegative(),
  computedAt: z.date(),
});

// --- Transfer probe (served after "I get it now") ----------------------------

export const transferProbeSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  skillId: idSchema,
  itemId: idSchema,
  createdAt: z.date(),
});

// --- Verification cycle (closes the loop; the MATH is P7) ---------------------

export const verificationVerdictSchema = z.enum([
  "improved",
  "flat",
  "regressed",
  "pending",
  "inconclusive",
]);

export const skillMeasureSchema = z.object({
  skillId: idSchema,
  accuracy: unitIntervalSchema,
  brier: z.number().optional(),
  itemCount: z.number().int().nonnegative(),
});

export const skillDriftSchema = z.object({
  skillId: idSchema,
  accuracy: unitIntervalSchema,
});

export const actionVerificationSchema = z.object({
  id: idSchema,
  nextActionId: idSchema,
  studentId: idSchema,
  targetSkillId: idSchema,
  openedAt: z.date(),
  baseline: skillMeasureSchema,
  baselineAssessmentId: idSchema,
  followup: skillMeasureSchema.optional(),
  followupAssessmentId: idSchema.optional(),
  accuracyVerdict: verificationVerdictSchema,
  calibrationVerdict: verificationVerdictSchema,
  untargetedDrift: z.array(skillDriftSchema).optional(),
  closedAt: z.date().optional(),
});
