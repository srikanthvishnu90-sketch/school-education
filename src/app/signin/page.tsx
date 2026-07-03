import type { ReactElement } from "react";
import { DEMO_ASSESSMENT_ID, getWorld } from "@/app/_world/world";
import {
  TEACHER_NAME,
  getTeacherWorld,
  studentDisplayName,
} from "@/app/_world/teacher";
import SignInList from "./SignInList";

export default async function SignInPage(): Promise<ReactElement> {
  const world = await getWorld();
  const teacher = await getTeacherWorld();

  const entries = [
    ...world.students.map((s) => ({
      id: s.id,
      name: studentDisplayName(s.id),
      role: "Student",
      href: `/predict/${DEMO_ASSESSMENT_ID}`,
    })),
    {
      id: teacher.teacherId,
      name: TEACHER_NAME,
      role: "Teacher",
      href: `/class/${teacher.classId}`,
    },
  ];

  return <SignInList entries={entries} />;
}
