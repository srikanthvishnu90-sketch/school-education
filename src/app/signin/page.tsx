import type { ReactElement } from "react";
import { getWorld } from "@/app/_world/world";
import { DEMO_REFLECTION_ID } from "@/app/_world/intelligence";
import { TEACHER_ID, TEACHER_NAME, studentDisplayName } from "@/app/_world/teacher";
import { COUNSELOR_ID, COUNSELOR_NAME } from "@/app/_world/roles";
import SignInList from "./SignInList";

export default async function SignInPage(): Promise<ReactElement> {
  const world = await getWorld();

  const entries = [
    ...world.students.map((s) => ({
      id: s.id,
      name: studentDisplayName(s.id),
      role: "Student",
      href: `/chat/${DEMO_REFLECTION_ID}`,
    })),
    {
      id: TEACHER_ID,
      name: TEACHER_NAME,
      role: "Teacher",
      href: "/lessons",
    },
    {
      id: COUNSELOR_ID,
      name: COUNSELOR_NAME,
      role: "Counselor",
      href: "/escalations",
    },
  ];

  return <SignInList entries={entries} />;
}
