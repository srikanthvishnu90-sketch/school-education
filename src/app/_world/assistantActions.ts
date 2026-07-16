"use server";

import { assistantReply, type AssistantMessage } from "./assistant";
import { findCourse } from "./courses";
import { clientIp, hit } from "./rateLimit";
import { screenReflectionText } from "./safetyActions";
import { getSessionUser } from "./session";
import { studentDisplayName } from "./teacher";

/**
 * The open study-chat boundary. Same safety contract as the reflection chat: the
 * student's latest message is crisis-screened FIRST (the escalation is created and
 * routed server-side), and only if it's clear does anything reach the model. The
 * conversation itself lives in the client for now — this action is stateless per
 * turn — so a refresh starts a fresh chat, by design.
 */

const MAX_MESSAGE = 2000;
const MAX_HISTORY = 40;

export interface AssistantTurn {
  crisis: boolean;
  reply: string;
}

export async function sendAssistantMessage(
  courseId: string,
  history: AssistantMessage[],
  message: string,
): Promise<AssistantTurn> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") {
    throw new Error("Only a signed-in student can use the study chat.");
  }
  const text = message.trim();
  if (text.length === 0) throw new Error("Type a message first.");
  if (text.length > MAX_MESSAGE) {
    throw new Error("That message is a bit long — try breaking it up.");
  }

  if (!(await hit(`assistant:${await clientIp()}:${user.id}`, 30, 60_000)).ok) {
    throw new Error("You’re sending messages very quickly. Give it a moment.");
  }

  // Safety FIRST: a crisis signal routes to a human and short-circuits the model.
  const { crisis } = await screenReflectionText(text);
  if (crisis) {
    return {
      crisis: true,
      reply:
        "It sounds like you might be going through something really hard. I've let a trusted adult at your school know so someone can check in with you. You're not in trouble, and you don't have to go through this alone.",
    };
  }

  const course = findCourse(courseId);
  if (course === null) throw new Error("Course not found.");

  // Bound the history the client sends, then append this turn.
  const trimmed = history
    .filter((m) => typeof m.text === "string" && m.text.trim().length > 0)
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("student" as const),
      text: m.text.slice(0, MAX_MESSAGE),
    }));
  const messages: AssistantMessage[] = [...trimmed, { role: "student", text }];

  const reply = await assistantReply(
    {
      courseName: course.name,
      teacher: course.teacher,
      studentName: studentDisplayName(user.id),
    },
    messages,
  );
  return { crisis: false, reply };
}
