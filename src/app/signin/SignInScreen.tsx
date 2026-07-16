import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { SEED_STUDENTS } from "@/application";
import { ADMIN_ID } from "@/app/_world/credentials";
import { COUNSELOR_ID, COUNSELOR_NAME } from "@/app/_world/roles";
import { getSessionUser } from "@/app/_world/session";
import { TEACHER_ID, TEACHER_NAME, studentDisplayName } from "@/app/_world/teacher";
import SignInList from "./SignInList";

/**
 * The single entry surface for plumb. It is BOTH the landing and the sign-in —
 * one screen that says what plumb is and lets you in — so there is exactly one
 * front door. Rendered at `/` and `/signin` alike. A signed-in visitor never sees
 * it; they are sent straight to their own home.
 */

const HOME_FOR_ROLE: Record<string, string> = {
  teacher: "/lessons",
  student: "/courses",
  counselor: "/escalations",
  admin: "/admin",
};

export default async function SignInScreen(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user !== null) redirect(HOME_FOR_ROLE[user.role] ?? "/courses");

  const entries = [
    ...SEED_STUDENTS.map((s) => ({
      id: s.id,
      name: studentDisplayName(s.id),
      role: "Student",
      href: "/courses",
    })),
    { id: TEACHER_ID, name: TEACHER_NAME, role: "Teacher", href: "/lessons" },
    {
      id: COUNSELOR_ID,
      name: COUNSELOR_NAME,
      role: "Counselor",
      href: "/escalations",
    },
    { id: ADMIN_ID, name: "District admin", role: "Admin", href: "/admin" },
  ];

  return <SignInList entries={entries} />;
}
