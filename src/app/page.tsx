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
 * The entry surface. A signed-in visitor is sent straight to their own home —
 * the marketing landing is only ever shown to someone who isn't signed in, so a
 * student never lands back on a generic hero after signing in. `?role=` seeds the
 * toggle so a link can point straight at one side.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user !== null) redirect(HOME_FOR_ROLE[user.role] ?? "/reflections");

  const { role } = await searchParams;
  const initialRole: Role = role === "student" ? "student" : "teacher";
  return <LandingShell initialRole={initialRole} />;
}
