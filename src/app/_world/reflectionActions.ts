"use server";

import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionQuestionSet,
  type ReflectionSession,
} from "@/domain/intelligence";
import type { ConversationStep } from "@/domain/ports/intelligence";
import { getSessionStudent } from "./session";
import { getWorld, type World } from "./world";
import type { ChatResult } from "./reflectionTypes";

/**
 * The reflection chat. The client shows one question, the student answers, we run
 * the deterministic (or LLM-fronted) engine to get the next move, and persist the
 * turn. Flow and safety are decided by the engine (safety deterministically);
 * this action only records messages and, at the end, the summary.
 */

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
  set: ReflectionQuestionSet,
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
      options: step.options,
    };
  }
  if (step.kind === "safety") {
    await world.intel.sessions.save(
      createReflectionSession({ ...session, status: "escalated" }),
    );
    return { kind: "safety", sessionId: session.id };
  }
  // summary: extract signals, summarize, persist, complete the session.
  const signals = await world.intelligence.extractSignals({ session });
  const summary = await world.intelligence.summarizeStudentReflection({ session, signals });
  await world.intel.studentSummaries.save(summary);
  await world.intel.sessions.save(
    createReflectionSession({ ...session, status: "completed", completedAt: now }),
  );
  return { kind: "summary", sessionId: session.id, summary };
}

async function studentIdOrDemo(): Promise<string> {
  return (await getSessionStudent()) ?? "student-demo";
}

export async function startReflection(reflectionId: string): Promise<ChatResult> {
  const world = await getWorld();
  const studentId = await studentIdOrDemo();
  const set = await world.intel.questionSets.findByLesson(reflectionId);
  if (set === null) throw new Error("This reflection is not available.");

  const existing = await world.intel.sessions.findByReflectionAndStudent(
    reflectionId,
    studentId,
  );
  if (existing !== null && existing.status !== "active") {
    const summary = await world.intel.studentSummaries.findByReflectionAndStudent(
      reflectionId,
      studentId,
    );
    if (summary !== null) return { kind: "summary", sessionId: existing.id, summary };
  }
  // Fresh session each start (deterministic id overwrites), so no resume ambiguity.
  const session = createReflectionSession({
    id: `${reflectionId}:${studentId}`,
    reflectionId,
    studentId,
    status: "active",
    startedAt: world.clock.now(),
    messages: [],
  });
  const step = await world.intelligence.nextTurn({ session, questionSet: set });
  return advance(world, session, set, step);
}

export async function sendReflectionMessage(
  sessionId: string,
  text: string,
): Promise<ChatResult> {
  const world = await getWorld();
  const found = await world.intel.sessions.findById(sessionId);
  if (found === null) throw new Error("Session not found.");
  const set = await world.intel.questionSets.findByLesson(found.reflectionId);
  if (set === null) throw new Error("This reflection is not available.");

  const withAnswer = append(found, "student", text.trim(), undefined, world.clock.now());
  await world.intel.sessions.save(withAnswer);
  const step = await world.intelligence.nextTurn({ session: withAnswer, questionSet: set });
  return advance(world, withAnswer, set, step);
}

export async function selectReflectionAction(
  sessionId: string,
  action: string,
): Promise<void> {
  const world = await getWorld();
  const session = await world.intel.sessions.findById(sessionId);
  if (session === null) return;
  await world.intel.sessions.save(
    createReflectionSession({
      ...session,
      selectedAction: action,
      studentConfirmedSummary: true,
    }),
  );
}
