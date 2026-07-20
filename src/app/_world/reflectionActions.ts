"use server";

import {
  createReflectionMessage,
  createReflectionSession,
  isQuestionSetApproved,
  type ReflectionQuestionSet,
  type ReflectionSession,
} from "@/domain/intelligence";
import type { ConversationStep } from "@/domain/ports/intelligence";
import { getSessionStudent } from "./session";
import { hasReflectionConsent } from "./consentActions";
import { hit } from "./rateLimit";
import { withLock } from "./keyedMutex";
import { screenReflectionText } from "./safetyActions";
import { getWorld, type World } from "./world";
import type {
  ChatHistoryMessage,
  ChatQuestion,
  ChatResult,
} from "./reflectionTypes";

/**
 * The reflection chat. The client shows one question, the student answers, we run
 * the deterministic (or LLM-fronted) engine to get the next move, and persist the
 * turn. Flow is decided by the engine; every answer first crosses the
 * deterministic safety boundary so a concern is routed before the normal flow
 * continues. This action records the transcript and, at the end, the summary.
 */

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_ACTION_LENGTH = 500;

async function requireStudent(): Promise<string> {
  const studentId = await getSessionStudent();
  if (studentId === null) throw new Error("Student authentication required.");
  return studentId;
}

function boundedText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} cannot be empty.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function historyOf(session: ReflectionSession): ChatHistoryMessage[] {
  return session.messages.map((message) => ({
    id: message.id,
    sender: message.sender,
    text: message.text,
    category: message.category,
    createdAt: message.createdAt.toISOString(),
  }));
}

function nextMsgId(session: ReflectionSession): string {
  return `${session.id}-m${session.messages.length}`;
}

function append(
  session: ReflectionSession,
  sender: "student" | "ai",
  text: string,
  category: ReflectionSession["messages"][number]["category"],
  now: Date,
): ReflectionSession {
  const message = createReflectionMessage({
    id: nextMsgId(session),
    sessionId: session.id,
    sender,
    text,
    category,
    createdAt: now,
  });
  return createReflectionSession({
    ...session,
    messages: [...session.messages, message],
  });
}

/** Apply the engine's next move: record a question, or finish with a summary/safety. */
async function advance(
  world: World,
  session: ReflectionSession,
  step: ConversationStep,
): Promise<ChatResult> {
  const now = world.clock.now();
  if (step.kind === "question") {
    const updated = append(session, "ai", step.text, step.category, now);
    await world.intel.sessions.save(updated);
    return {
      kind: "question",
      sessionId: session.id,
      stage: step.stage,
      category: step.category,
      text: step.text,
      format: step.format,
      required: step.required,
      options: step.options,
      history: historyOf(updated),
    };
  }
  if (step.kind === "safety") {
    const escalated = createReflectionSession({
      ...session,
      status: "escalated",
    });
    await world.intel.sessions.save(escalated);
    return {
      kind: "safety",
      sessionId: session.id,
      history: historyOf(escalated),
    };
  }
  // summary: extract signals, summarize, persist, complete the session.
  const signals = await world.intelligence.extractSignals({ session });
  const summary = await world.intelligence.summarizeStudentReflection({
    session,
    signals,
  });
  await world.intel.studentSummaries.save(summary);
  const completed = createReflectionSession({
    ...session,
    status: "completed",
    completedAt: now,
  });
  await world.intel.sessions.save(completed);
  return {
    kind: "summary",
    sessionId: session.id,
    summary,
    history: historyOf(completed),
  };
}

async function resumeActive(
  world: World,
  session: ReflectionSession,
  set: ReflectionQuestionSet,
): Promise<ChatResult> {
  const step = await world.intelligence.nextTurn({ session, questionSet: set });
  const latest = session.messages.at(-1);

  // A persisted assistant turn is the still-open question. Return it with its
  // original text instead of appending a duplicate when the page is refreshed.
  if (latest?.sender === "ai") {
    if (step.kind !== "question") {
      throw new Error("This reflection could not be resumed.");
    }
    const result: ChatQuestion = {
      kind: "question",
      sessionId: session.id,
      stage: step.stage,
      category: latest.category ?? step.category,
      text: latest.text,
      format: step.format,
      required: step.required,
      options: step.options,
      history: historyOf(session),
    };
    return result;
  }

  // Empty sessions and sessions interrupted after persisting a student answer
  // continue from the engine's next move.
  return advance(world, session, step);
}

export async function startReflection(
  reflectionId: string,
): Promise<ChatResult> {
  const studentId = await requireStudent();
  const world = await getWorld();
  const set = await world.intel.questionSets.findByLesson(reflectionId);
  // Fail closed: an unapproved (AI-drafted, teacher-not-yet-reviewed) set is not
  // available to students — the same as no set at all. A person gates the AI.
  if (set === null || !isQuestionSetApproved(set)) {
    throw new Error("This reflection is not available.");
  }

  const existing = await world.intel.sessions.findByReflectionAndStudent(
    reflectionId,
    studentId,
  );
  if (existing?.status === "active") {
    return resumeActive(world, existing, set);
  }
  if (existing?.status === "escalated") {
    return {
      kind: "safety",
      sessionId: existing.id,
      history: historyOf(existing),
    };
  }
  if (existing?.status === "completed") {
    const summary =
      await world.intel.studentSummaries.findByReflectionAndStudent(
        reflectionId,
        studentId,
      );
    if (summary === null)
      throw new Error("This reflection summary is unavailable.");
    return {
      kind: "summary",
      sessionId: existing.id,
      summary,
      selectedAction: existing.selectedAction,
      history: historyOf(existing),
    };
  }
  if (existing?.status === "abandoned") {
    throw new Error("This reflection can no longer be resumed.");
  }

  // No emotional data is captured without consent on file (COPPA). The chat page
  // redirects first; this is the defense-in-depth stop for a direct action call.
  if (!(await hasReflectionConsent())) {
    throw new Error("Consent is required before starting a reflection.");
  }

  const session = createReflectionSession({
    id: `${reflectionId}:${studentId}`,
    reflectionId,
    studentId,
    status: "active",
    startedAt: world.clock.now(),
    messages: [],
  });
  const step = await world.intelligence.nextTurn({ session, questionSet: set });
  return advance(world, session, step);
}

export async function sendReflectionMessage(
  sessionId: string,
  text: string,
): Promise<ChatResult> {
  const studentId = await requireStudent();
  const answer = boundedText(text, "Message", MAX_MESSAGE_LENGTH);
  // Cap the message rate per session so the chat can't be spammed into the LLM
  // cost ledger or the crisis screener.
  if (!(await hit(`msg:${sessionId}`, 20, 60_000)).ok) {
    throw new Error("You’re sending messages very quickly. Give it a moment.");
  }
  // Serialize the read-modify-write per session so two rapid submits can't both
  // read the same base and clobber each other's message (and collide on ids).
  return withLock(`session:${sessionId}`, async () => {
    const world = await getWorld();
    const found = await world.intel.sessions.findById(sessionId);
    if (found === null || found.studentId !== studentId) {
      throw new Error("Session not found.");
    }
    if (found.status !== "active") {
      throw new Error("This reflection is not accepting messages.");
    }
    const set = await world.intel.questionSets.findByLesson(found.reflectionId);
    // Fail closed: an unapproved (AI-drafted, teacher-not-yet-reviewed) set is not
  // available to students — the same as no set at all. A person gates the AI.
  if (set === null || !isQuestionSetApproved(set)) {
    throw new Error("This reflection is not available.");
  }

    // This boundary creates and routes the counselor escalation. The intelligence
    // adapter's detector is only a stop signal and is not a substitute for routing.
    const { crisis } = await screenReflectionText(answer);
    const withAnswer = append(found, "student", answer, undefined, world.clock.now());
    if (crisis) {
      const escalated = createReflectionSession({ ...withAnswer, status: "escalated" });
      await world.intel.sessions.save(escalated);
      return {
        kind: "safety",
        sessionId: escalated.id,
        history: historyOf(escalated),
      };
    }

    await world.intel.sessions.save(withAnswer);
    const step = await world.intelligence.nextTurn({
      session: withAnswer,
      questionSet: set,
    });
    return advance(world, withAnswer, step);
  });
}

export async function selectReflectionAction(
  sessionId: string,
  action: string,
): Promise<void> {
  const studentId = await requireStudent();
  const selected = boundedText(action, "Action", MAX_ACTION_LENGTH);
  const world = await getWorld();
  const session = await world.intel.sessions.findById(sessionId);
  if (session === null || session.studentId !== studentId) {
    throw new Error("Session not found.");
  }
  if (session.status !== "completed") {
    throw new Error(
      "An action can only be selected for a completed reflection.",
    );
  }
  if (session.selectedAction !== undefined) {
    if (session.selectedAction === selected) return;
    throw new Error("An action has already been selected.");
  }
  const summary = await world.intel.studentSummaries.findByReflectionAndStudent(
    session.reflectionId,
    studentId,
  );
  if (summary === null || !summary.recommendedActions.includes(selected)) {
    throw new Error("That action is not available for this reflection.");
  }
  await world.intel.sessions.save(
    createReflectionSession({
      ...session,
      selectedAction: selected,
    }),
  );
}
