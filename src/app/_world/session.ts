"use server";

import { cookies } from "next/headers";
import type { Id } from "@/domain";

/**
 * The sign-in session — the app's link between a browser and a student identity.
 * There are no passwords in this pre-infra build: signing in picks a seeded
 * student and stores their id in an http-only cookie. Every scoped query and
 * every write derives the student from HERE, server-side — the client never gets
 * to name which student it is (so one student cannot act as another).
 */

const COOKIE = "plumb_session";

export async function signIn(studentId: Id): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, studentId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** The signed-in student id, or null when there is no session. */
export async function getSessionStudent(): Promise<Id | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}
