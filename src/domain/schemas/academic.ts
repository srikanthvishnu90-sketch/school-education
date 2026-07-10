import { z } from "zod";
import { idSchema, nonNegativeSchema, unitIntervalSchema } from "./common";

/**
 * Zod schemas for the ACADEMIC axis — goal → outcome → reflection, plus the
 * skill/assessment structure they hang on. The pre-assessment prediction and the
 * calibration/verification it fed were retired. Mirrors the interfaces in the
 * sibling domain files 1:1 (compile-time enforced by ../schemas/_typecheck.ts).
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
  answer: z.string().min(1).optional(),
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

// --- Outcome -----------------------------------------------------------------

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

// --- Transfer probe (served after "I get it now") ----------------------------

export const transferProbeSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  skillId: idSchema,
  itemId: idSchema,
  createdAt: z.date(),
});

// --- Consent (SOPPA/COPPA lifecycle object) ----------------------------------

export const consentScopeSchema = z.enum(["academic", "affect", "telemetry"]);

export const consentRecordSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  grantorType: z.enum(["parent", "self"]),
  scopes: z.array(consentScopeSchema),
  status: z.enum(["granted", "revoked"]),
  grantedAt: z.date(),
  revokedAt: z.date().optional(),
});

