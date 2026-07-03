import type { ReactElement } from "react";
import { DEMO_ASSESSMENT_ID, getWorld } from "@/app/_world/world";
import SignInList from "./SignInList";

function nameFor(id: string): string {
  const raw = id.replace(/^student-/, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default async function SignInPage(): Promise<ReactElement> {
  const world = await getWorld();
  const students = world.students.map((s) => ({ id: s.id, name: nameFor(s.id) }));
  return <SignInList students={students} assessmentId={DEMO_ASSESSMENT_ID} />;
}
