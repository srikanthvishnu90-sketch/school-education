import { z } from "zod";
import { idSchema } from "./common";

/**
 * Zod schemas for the REFLECTION-INTELLIGENCE axis — the new product core:
 * lesson → AI lesson analysis → AI-generated reflection questions → (later)
 * adaptive student conversation → student/class summaries.
 *
 * Mirrors the interfaces in src/domain/intelligence/* 1:1 (compile-time enforced
 * by ../intelligence/_typecheck.ts). Product principles from the spec are encoded
 * as invariants in the sibling domain factories, not here.
 */

// --- Lesson ------------------------------------------------------------------

export const lessonTypeSchema = z.enum([
  "direct_instruction",
  "discussion",
  "group_work",
  "independent_practice",
  "lab",
  "presentation",
  "project",
  "review",
  "assessment_prep",
  "other",
]);

export const lessonSchema = z.object({
  id: idSchema,
  classId: idSchema,
  teacherId: idSchema,
  title: z.string().min(1),
  date: z.date(),
  lessonType: lessonTypeSchema,
  content: z.string().min(1),
  objectives: z.array(z.string().min(1)),
  standards: z.array(z.string().min(1)),
  createdAt: z.date(),
});

// --- AI lesson analysis (labor, not judgment) --------------------------------

export const lessonAnalysisSchema = z.object({
  lessonId: idSchema,
  topic: z.string().min(1),
  subtopics: z.array(z.string().min(1)),
  objectives: z.array(z.string().min(1)),
  vocabulary: z.array(z.string().min(1)),
  prerequisites: z.array(z.string().min(1)),
  technicalSteps: z.array(z.string().min(1)),
  misconceptions: z.array(z.string().min(1)),
  difficultTransitions: z.array(z.string().min(1)),
  independentApplication: z.array(z.string().min(1)),
  emotionalPressurePoints: z.array(z.string().min(1)),
  reflectionFocus: z.string().min(1),
  createdAt: z.date(),
});

// --- Generated reflection questions ------------------------------------------

export const questionCategorySchema = z.enum([
  "technical",
  "emotional",
  "behavioral",
  "metacognitive",
]);

export const questionFormatSchema = z.enum([
  "multiple_choice",
  "rating",
  "short_response",
  "long_response",
  "emotion_select",
  "confidence_slider",
  "multi_select",
  "open",
]);

export const generatedQuestionSchema = z.object({
  id: idSchema,
  category: questionCategorySchema,
  text: z.string().min(1),
  format: questionFormatSchema,
  options: z.array(z.string().min(1)).optional(),
  order: z.number().int().nonnegative(),
  required: z.boolean(),
  aiGenerated: z.boolean(),
});

export const reflectionQuestionSetSchema = z.object({
  lessonId: idSchema,
  questions: z.array(generatedQuestionSchema),
  adaptiveFollowupsEnabled: z.boolean(),
  maxFollowups: z.number().int().min(0).max(4),
  createdAt: z.date(),
});
