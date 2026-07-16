"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Id } from "@/domain";
import { TEACHER_ID } from "./teacher";
import { COUNSELOR_ID } from "./roles";
import { roleForId } from "./credentials";

/**
 * The sign-in session — the app's link between a browser and an identity. The
 * cookie carries only the id; the ROLE is looked up server-side from the
 * credential store (or, for the seeded demo, derived from the id), so the client
 * never gets to name who it is — one user cannot act as another.
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

/** Sign out and return to the entry surface. A form action (POST), never a GET. */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}

export async function getSessionUser(): Promise<{
  id: Id;
  role: "student" | "teacher" | "counselor";
} | null> {
  const store = await cookies();
  const id = store.get(COOKIE)?.value ?? null;
  if (id === null) return null;
  const role =
    (await roleForId(id)) ??
    (id === TEACHER_ID
      ? "teacher"
      : id === COUNSELOR_ID
        ? "counselor"
        : "student");
  return { id, role };
}

/** The signed-in STUDENT id (null when there is no session, or it's a teacher). */
export async function getSessionStudent(): Promise<Id | null> {
  const user = await getSessionUser();
  return user !== null && user.role === "student" ? user.id : null;
}
