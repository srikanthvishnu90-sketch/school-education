import type { ReactElement } from "react";
import { SEED_STUDENTS } from "@/application";
import {
  TEACHER_ID,
  TEACHER_NAME,
  studentDisplayName,
} from "@/app/_world/teacher";
import { COUNSELOR_ID, COUNSELOR_NAME } from "@/app/_world/roles";
import { ADMIN_ID } from "@/app/_world/credentials";
import SignInList from "./SignInList";

export default function SignInPage(): ReactElement {
  const entries = [
    ...SEED_STUDENTS.map((s) => ({
      id: s.id,
      name: studentDisplayName(s.id),
      role: "Student",
      href: "/reflections",
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
    {
      id: ADMIN_ID,
      name: "District admin",
      role: "Admin",
      href: "/admin",
    },
  ];

  return <SignInList entries={entries} />;
}
