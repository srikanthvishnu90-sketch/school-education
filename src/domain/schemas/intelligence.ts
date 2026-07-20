import { z } from "zod";
import { idSchema, unitIntervalSchema } from "./common";

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
  tenantId: idSchema,
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
  /**
   * When a teacher approved these AI-drafted questions for students. `null` = a
   * draft awaiting review. AI output NEVER reaches a student until a person sets
   * this — the human gate is a domain invariant, not a UI convenience.
   */
  approvedAt: z.date().nullable(),
});

// --- Extracted signals (closed taxonomies) -----------------------------------

export const technicalSignalSchema = z.enum([
  "understood_concept",
  "misunderstood_concept",
  "unclear_step",
  "can_explain",
  "independent_application",
  "misconception",
  "recall_difficulty",
  "application_difficulty",
  "reading_difficulty",
  "time_management",
  "careless_error",
  "prerequisite_gap",
]);

export const emotionalSignalSchema = z.enum([
  "confident",
  "frustrated",
  "interested",
  "bored",
  "embarrassed",
  "discouraged",
  "curious",
  "rushed",
  "overwhelmed",
  "comfortable_asking_help",
  "fear_of_mistakes",
  "sense_of_progress",
]);

export const behavioralSignalSchema = z.enum([
  "asked_for_help",
  "avoided_help",
  "kept_trying",
  "stopped_working",
  "guessed",
  "rushed",
  "checked_work",
  "used_notes",
  "relied_on_examples",
  "collaborated",
  "disengaged",
  "sought_clarification",
  "changed_strategy",
]);

export const contextSignalSchema = z.enum([
  "individual_work",
  "group_work",
  "teacher_led",
  "independent_work",
  "assessment",
  "time_pressure",
  "peer_comparison",
  "classroom_participation",
]);

export const extractedSignalsSchema = z.object({
  technical: z.array(technicalSignalSchema),
  emotional: z.array(emotionalSignalSchema),
  behavioral: z.array(behavioralSignalSchema),
  context: z.array(contextSignalSchema),
});

// --- Adaptive reflection session (the student chat) --------------------------

export const messageSenderSchema = z.enum(["student", "ai"]);

export const reflectionStageSchema = z.enum([
  "overall",
  "technical",
  "emotional",
  "behavioral",
  "support",
  "action",
]);

export const sessionStatusSchema = z.enum([
  "active",
  "completed",
  "abandoned",
  "escalated",
]);

export const reflectionMessageSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  sender: messageSenderSchema,
  text: z.string().min(1).max(4_000),
  category: questionCategorySchema.optional(),
  createdAt: z.date(),
});

export const reflectionSessionSchema = z.object({
  id: idSchema,
  reflectionId: idSchema,
  studentId: idSchema,
  status: sessionStatusSchema,
  messages: z.array(reflectionMessageSchema),
  selectedAction: z.string().min(1).max(500).optional(),
  studentConfirmedSummary: z.boolean().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
});

// --- Insight summaries -------------------------------------------------------

export const confidenceLevelSchema = z.enum(["high", "moderate", "limited"]);

export const attentionGroupSchema = z.enum([
  "low_understanding_low_confidence",
  "high_understanding_low_confidence",
  "low_understanding_high_confidence",
  "significant_emotional_change",
  "reflection_assessment_mismatch",
  "repeated_help_avoidance",
  "positive_improvement",
]);

export const attentionStudentSchema = z.object({
  studentId: idSchema,
  group: attentionGroupSchema,
});

export const studentInsightSummarySchema = z.object({
  id: idSchema,
  studentId: idSchema,
  reflectionId: idSchema,
  technicalSummary: z.string().min(1),
  emotionalSummary: z.string().min(1),
  behavioralSummary: z.string().min(1),
  relationshipSummary: z.string().min(1),
  recommendedActions: z.array(z.string().min(1)),
  studentFacingSummary: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  confidenceLevel: confidenceLevelSchema,
  createdAt: z.date(),
});

export const classInsightSummarySchema = z.object({
  id: idSchema,
  classId: idSchema,
  reflectionId: idSchema,
  technicalSummary: z.string().min(1),
  emotionalSummary: z.string().min(1),
  behavioralSummary: z.string().min(1),
  keyRelationship: z.string().min(1),
  recommendedPlan: z.array(z.string().min(1)),
  attentionStudents: z.array(attentionStudentSchema),
  createdAt: z.date(),
});

// --- Reflection performance (P7: the graded result behind a reflection) -------

export const reflectionPerformanceSchema = z.object({
  reflectionId: idSchema,
  studentId: idSchema,
  /** Fraction 0..1 the student actually earned on the graded work. */
  score: unitIntervalSchema,
  recordedAt: z.date(),
});
