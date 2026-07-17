import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import LandingShell from "./_landing/LandingShell";
import type { Role } from "./_landing/RoleToggle";

const HOME_FOR_ROLE: Record<string, string> = {
  teacher: "/lessons",
  student: "/courses",
  counselor: "/escalations",
  admin: "/admin",
};

/**
 * The landing — the branded chatbox entry. From here you log in: a teacher lands
 * on the dashboard, a student on their classes. A visitor who is ALREADY signed in
 * is sent straight to their workspace so the landing is only ever the signed-out
 * front door. `?role=` seeds the Teacher/Student toggle.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user !== null) redirect(HOME_FOR_ROLE[user.role] ?? "/courses");

  const { role } = await searchParams;
  const initialRole: Role = role === "student" ? "student" : "teacher";
  return <LandingShell initialRole={initialRole} />;
}
