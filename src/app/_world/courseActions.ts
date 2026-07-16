"use server";

import { COURSES } from "./courses";
import { getSessionUser } from "./session";
import { getWorld } from "./world";

/**
 * The student's course list and the reflections inside one. A course is a class
 * in the domain, so this reads the real lesson feed per class — a course with no
 * posted lesson honestly reports zero rather than inventing coursework.
 */

export interface CourseCard {
  id: string;
  name: string;
  code: string;
  teacher: string;
  monogram: string;
  /** Reflections the teacher has posted for this course. */
  total: number;
  /** Of those, how many this student still hasn't finished. */
  open: number;
}

export interface CourseReflection {
  reflectionId: string;
  title: string;
  createdAt: string;
  status: string;
}

async function requireStudent(): Promise<string> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") {
    throw new Error("Only a student can view courses.");
  }
  return user.id;
}

export async function listCourses(): Promise<CourseCard[]> {
  const studentId = await requireStudent();
  const world = await getWorld();
  const sessions = await world.intel.sessions.listByStudent(studentId);
  const byReflection = new Map(sessions.map((s) => [s.reflectionId, s]));

  return Promise.all(
    COURSES.map(async (course): Promise<CourseCard> => {
      const lessons = await world.intel.lessons.listByClass(course.id);
      const open = lessons.filter(
        (l) => byReflection.get(l.id)?.status !== "completed",
      ).length;
      return { ...course, total: lessons.length, open };
    }),
  );
}

export async function listCourseReflections(
  courseId: string,
): Promise<CourseReflection[]> {
  const studentId = await requireStudent();
  const world = await getWorld();
  const [lessons, sessions] = await Promise.all([
    world.intel.lessons.listByClass(courseId),
    world.intel.sessions.listByStudent(studentId),
  ]);
  const byReflection = new Map(sessions.map((s) => [s.reflectionId, s]));

  return lessons
    .map((lesson) => ({
      reflectionId: lesson.id,
      title: lesson.title,
      createdAt: lesson.createdAt.toISOString(),
      status: byReflection.get(lesson.id)?.status ?? "not_started",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
