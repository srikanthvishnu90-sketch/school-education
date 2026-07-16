import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { listCourses } from "@/app/_world/courseActions";
import { getSessionUser } from "@/app/_world/session";
import { studentDisplayName } from "@/app/_world/teacher";
import CoursesShell from "./CoursesShell";

/** The student's home after login: their classes, D2L-style, on the dark shell. */
export default async function CoursesPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const courses = await listCourses();
  return (
    <CoursesShell
      courses={courses}
      greeting={`Hey, ${studentDisplayName(user.id)}. Ready to dive in?`}
    />
  );
}
