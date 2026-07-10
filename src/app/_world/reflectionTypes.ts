import type { QuestionCategory, QuestionFormat } from "@/domain/intelligence/question";
import type { ReflectionStage } from "@/domain/intelligence/session";
import type { StudentInsightSummary } from "@/domain/intelligence/insight";

/**
 * Serializable results the reflection chat action returns to the client. A plain
 * (non-"use server") module so both the action and the client component may
 * import the types.
 */

export interface ChatQuestion {
  kind: "question";
  sessionId: string;
  stage: ReflectionStage;
  category: QuestionCategory;
  text: string;
  format: QuestionFormat;
  options?: string[];
}

export interface ChatSummary {
  kind: "summary";
  sessionId: string;
  summary: StudentInsightSummary;
}

export interface ChatSafety {
  kind: "safety";
  sessionId: string;
}

export type ChatResult = ChatQuestion | ChatSummary | ChatSafety;
