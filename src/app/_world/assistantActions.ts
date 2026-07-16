"use server";

import { assistantReply, type AssistantMessage } from "./assistant";
import { findCourse } from "./courses";
import { clientIp, hit } from "./rateLimit";
import { screenReflectionText } from "./safetyActions";
import { getSessionUser } from "./session";
import { loadStudyChat, saveStudyChat } from "./studyChat";
import { studentDisplayName } from "./teacher";

/**
 * The open study-chat boundary. Same safety contract as the reflection chat: the
 * student's latest message is crisis-screened FIRST (the escalation is created and
 * routed server-side), and only if it's clear does anything reach the model. The
 * conversation is PERSISTED per (student, course) — the server loads the history
 * itself rather than trusting the client, so it survives a refresh and can't be
 * spoofed.
 */

const MAX_MESSAGE = 2000;

export interface AssistantTurn {
  crisis: boolean;
  reply: string;
}

async function requireStudent(): Promise<{ id: string }> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") {
    throw new Error("Only a signed-in student can use the study chat.");
  }
  return { id: user.id };
}

/** The persisted conversation for a course (empty before the first message). */
export async function getStudyChat(courseId: string): Promise<AssistantMessage[]> {
  const { id } = await requireStudent();
  return loadStudyChat(id, courseId);
}

export async function sendAssistantMessage(
  courseId: string,
  message: string,
): Promise<AssistantTurn> {
  const { id } = await requireStudent();
  const text = message.trim();
  if (text.length === 0) throw new Error("Type a message first.");
  if (text.length > MAX_MESSAGE) {
    throw new Error("That message is a bit long — try breaking it up.");
  }

  if (!(await hit(`assistant:${await clientIp()}:${id}`, 30, 60_000)).ok) {
    throw new Error("You’re sending messages very quickly. Give it a moment.");
  }

  // Safety FIRST: a crisis signal routes to a human and short-circuits the model.
  // A crisis turn is not persisted to the chat — the escalation is the record.
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

  // Server-authoritative history: load what's stored, append this turn.
  const history = await loadStudyChat(id, courseId);
  const withStudent: AssistantMessage[] = [...history, { role: "student", text }];

  const reply = await assistantReply(
    {
      courseName: course.name,
      teacher: course.teacher,
      studentName: studentDisplayName(id),
    },
    withStudent,
  );

  await saveStudyChat(id, courseId, [
    ...withStudent,
    { role: "assistant", text: reply },
  ]);
  return { crisis: false, reply };
}
