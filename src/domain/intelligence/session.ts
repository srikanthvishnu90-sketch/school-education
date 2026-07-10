import { type Id } from "../common";
import {
  reflectionMessageSchema,
  reflectionSessionSchema,
} from "../schemas/intelligence";
import type { QuestionCategory } from "./question";

/**
 * The adaptive student reflection — a short chatbot conversation, one question at
 * a time (spec → Student AI reflection chatbot). It walks the six stages
 * (overall → technical → emotional → behavioral → support → action) but stops
 * early once enough is known. The message log IS the record the summary is built
 * from; nothing else is stored about what the student "is".
 */

export type MessageSender = "student" | "ai";

export type ReflectionStage =
  | "overall"
  | "technical"
  | "emotional"
  | "behavioral"
  | "support"
  | "action";

export type SessionStatus = "active" | "completed" | "abandoned" | "escalated";

export interface ReflectionMessage {
  id: Id;
  sessionId: Id;
  sender: MessageSender;
  text: string;
  /** The reasoning category this turn belongs to (for signal extraction). */
  category?: QuestionCategory;
  createdAt: Date;
}

export interface ReflectionSession {
  id: Id;
  reflectionId: Id;
  studentId: Id;
  status: SessionStatus;
  messages: ReflectionMessage[];
  /** The one practical next step the student chose (Stage 6). */
  selectedAction?: string;
  /** Whether the student confirmed (vs corrected) the AI's summary. */
  studentConfirmedSummary?: boolean;
  startedAt: Date;
  completedAt?: Date;
}

/** The six stages, in order — the spine of the conversation. */
export const REFLECTION_STAGES: readonly ReflectionStage[] = [
  "overall",
  "technical",
  "emotional",
  "behavioral",
  "support",
  "action",
];

export function createReflectionMessage(input: ReflectionMessage): ReflectionMessage {
  return Object.freeze(reflectionMessageSchema.parse(input));
}

export function createReflectionSession(input: ReflectionSession): ReflectionSession {
  return Object.freeze(reflectionSessionSchema.parse(input));
}

/** The student answers so far, oldest → newest. */
export function studentAnswers(session: ReflectionSession): ReflectionMessage[] {
  return session.messages.filter((m) => m.sender === "student");
}
