import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { listCourseReflections } from "@/app/_world/courseActions";
import { findCourse } from "@/app/_world/courses";
import { getSessionUser } from "@/app/_world/session";
import CourseShell from "./CourseShell";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<ReactElement> {
  const { courseId } = await params;
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const course = findCourse(courseId);
  if (course === null) notFound();

  const reflections = await listCourseReflections(courseId);
  return <CourseShell course={course} reflections={reflections} />;
}
