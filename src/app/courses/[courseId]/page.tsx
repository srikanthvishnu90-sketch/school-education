import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getStudyChat } from "@/app/_world/assistantActions";
import { listCourseReflections } from "@/app/_world/courseActions";
import { findCourse } from "@/app/_world/courses";
import { getSessionUser } from "@/app/_world/session";
import { studentDisplayName } from "@/app/_world/teacher";
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

  const [reflections, chatHistory] = await Promise.all([
    listCourseReflections(courseId),
    getStudyChat(courseId),
  ]);
  return (
    <CourseShell
      course={course}
      reflections={reflections}
      studentName={studentDisplayName(user.id)}
      chatHistory={chatHistory}
    />
  );
}
