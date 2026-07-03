"use server";

import { cookies } from "next/headers";
import type { Id } from "@/domain";
import { TEACHER_ID } from "./teacher";

/**
 * The sign-in session — the app's link between a browser and an identity. No
 * passwords in this pre-infra build: signing in picks a seeded user and stores
 * their id in an http-only cookie. Role is derived server-side; the client never
 * gets to name who it is (so one user cannot act as another).
 */

const COOKIE = "plumb_session";

export async function signIn(userId: Id): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUser(): Promise<{
  id: Id;
  role: "student" | "teacher";
} | null> {
  const store = await cookies();
  const id = store.get(COOKIE)?.value ?? null;
  if (id === null) return null;
  return { id, role: id === TEACHER_ID ? "teacher" : "student" };
}

/** The signed-in STUDENT id (null when there is no session, or it's a teacher). */
export async function getSessionStudent(): Promise<Id | null> {
  const user = await getSessionUser();
  return user !== null && user.role === "student" ? user.id : null;
}
