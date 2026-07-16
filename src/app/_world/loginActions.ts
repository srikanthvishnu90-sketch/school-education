"use server";

import { SEED_STUDENTS } from "@/application";
import { signIn } from "./session";
import { TEACHER_ID } from "./teacher";

/**
 * Role-based demo sign-in. There is no credential check yet (Supabase lands
 * later) — this establishes the SAME http-only session cookie the rest of the
 * app already trusts, then hands back where that role lives. Kept deliberately
 * explicit: the surface tells the student it isn't checking a password, rather
 * than pretending it did.
 */

export type LoginRole = "teacher" | "student";

/** Signs the role in and returns where that role's product starts. */
export async function loginAs(role: LoginRole): Promise<string> {
  const id = role === "teacher" ? TEACHER_ID : SEED_STUDENTS[0].id;
  await signIn(id);
  return role === "teacher" ? "/lessons" : "/courses";
}
