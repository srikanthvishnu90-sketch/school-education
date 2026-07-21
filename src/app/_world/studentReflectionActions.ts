"use server";

import type { LessonType, ReflectionSession } from "@/domain/intelligence";
import { getSessionUser } from "./session";
import { getWorld } from "./world";

/** The demo roster currently places every student in the teacher's single class. */
const STUDENT_CLASS_ID = "class-1";

export type StudentReflectionStatus =
  ReflectionSession["status"] | "not_started";

export interface StudentReflectionListItem {
  reflectionId: string;
  title: string;
  lessonType: LessonType;
  createdAt: string;
  status: StudentReflectionStatus;
}

/**
 * List the reflections available to the signed-in student, including only that
 * student's progress. Lesson content comes from the teacher's class feed; the
 * question set behind each lesson was generated when the teacher created it.
 */
export async function listStudentReflections(): Promise<
  StudentReflectionListItem[]
> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") {
    throw new Error("Only a student can view these reflections.");
  }

  const world = await getWorld();
  // A self-signup who is on no class roster must NOT see a real school's lesson feed
  // (privacy). Enrolled demo students (SEED_STUDENTS) pass; a random signup gets an
  // empty inbox by design. (Consistency with /courses for self-signups is a separate
  // follow-up — the correct direction is to gate /courses too, never to open this.)
  const enrolled = world.students.some((student) => student.id === user.id);
  if (!enrolled) return [];
  const [allLessons, sessions] = await Promise.all([
    world.intel.lessons.listByClass(STUDENT_CLASS_ID),
    world.intel.sessions.listByStudent(user.id),
  ]);
  // A student only ever sees lessons from their own district (tenant).
  const lessons = allLessons.filter((l) => l.tenantId === user.tenantId);
  const sessionByReflection = new Map(
    sessions.map((session) => [session.reflectionId, session]),
  );

  return lessons
    .map((lesson): StudentReflectionListItem => ({
      reflectionId: lesson.id,
      title: lesson.title,
      lessonType: lesson.lessonType,
      createdAt: lesson.createdAt.toISOString(),
      status: sessionByReflection.get(lesson.id)?.status ?? "not_started",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
