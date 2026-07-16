"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Id } from "@/domain";
import { TEACHER_ID } from "./teacher";
import { COUNSELOR_ID } from "./roles";
import { roleForId } from "./credentials";
import { signSession, verifySession } from "./sessionToken";

/**
 * The sign-in session — the app's link between a browser and an identity. The
 * cookie carries a SIGNED token (`id.HMAC`), not the raw id, so a browser cannot
 * forge a session for a known id. The role is then looked up server-side from the
 * credential store (or, for the seeded demo, derived from the id) — the client
 * never gets to name who it is.
 */

const COOKIE = "plumb_session";

export async function signIn(userId: Id): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
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
  const raw = store.get(COOKIE)?.value ?? null;
  const id = raw === null ? null : verifySession(raw);
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
