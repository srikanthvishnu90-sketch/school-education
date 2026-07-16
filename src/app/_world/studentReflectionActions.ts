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
  const enrolled = world.students.some((student) => student.id === user.id);
  if (!enrolled) return [];
  const [lessons, sessions] = await Promise.all([
    world.intel.lessons.listByClass(STUDENT_CLASS_ID),
    world.intel.sessions.listByStudent(user.id),
  ]);
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
