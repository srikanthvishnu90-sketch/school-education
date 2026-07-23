import type {
  QuestionCategory,
  QuestionFormat,
} from "@/domain/intelligence/question";
import type { ReflectionStage } from "@/domain/intelligence/session";
import type { StudentInsightSummary } from "@/domain/intelligence/insight";

/**
 * Serializable results the reflection chat action returns to the client. A plain
 * (non-"use server") module so both the action and the client component may
 * import the types.
 */

/** A JSON-safe copy of one persisted turn, oldest to newest. */
export interface ChatHistoryMessage {
  id: string;
  sender: "student" | "ai";
  text: string;
  category?: QuestionCategory;
  createdAt: string;
}

interface ChatHistory {
  /** Persisted transcript after the server applies the latest state transition. */
  history?: ChatHistoryMessage[];
}

export interface ChatQuestion extends ChatHistory {
  kind: "question";
  sessionId: string;
  stage: ReflectionStage;
  category: QuestionCategory;
  text: string;
  format: QuestionFormat;
  required: boolean;
  options?: string[];
  /** A teacher's worked example, shown as a reference panel beside this question. */
  exemplar?: string;
}

export interface ChatSummary extends ChatHistory {
  kind: "summary";
  sessionId: string;
  summary: StudentInsightSummary;
  /** The student's already-persisted choice, when revisiting a completed chat. */
  selectedAction?: string;
  /**
   * The lesson's teacher-authored worked example, when one exists. Present ONLY on
   * lessons with an exemplar; its presence is what unlocks the closing from-memory
   * transfer probe (attempt → reveal this exemplar → self-compare). Absent = the
   * reflection ends at the summary exactly as before.
   */
  exemplar?: string;
  /** The lesson title, used to phrase the probe prompt ("the main idea from '…'"). */
  lessonTitle?: string;
}

export interface ChatSafety extends ChatHistory {
  kind: "safety";
  sessionId: string;
}

export type ChatResult = ChatQuestion | ChatSummary | ChatSafety;
