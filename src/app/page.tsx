import type { ReactElement } from "react";
import LandingShell from "./_landing/LandingShell";
import type { Role } from "./_landing/RoleToggle";

/**
 * The entry surface. `?role=` seeds the toggle so a link can point straight at
 * one side; from there the choice lives in client state.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<ReactElement> {
  const { role } = await searchParams;
  const initialRole: Role = role === "student" ? "student" : "teacher";
  return <LandingShell initialRole={initialRole} />;
}
