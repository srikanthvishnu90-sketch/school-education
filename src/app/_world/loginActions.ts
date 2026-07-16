"use server";

import {
  createStudentAccount,
  verifyCredentials,
} from "./credentials";
import { clientIp, hit } from "./rateLimit";
import { signIn } from "./session";

/**
 * Real credential sign-in. A password is actually checked (salted scrypt hash,
 * constant-time compare in ./credentials); on success the SAME http-only session
 * cookie the app already trusts is set, and the role — which comes from the
 * account, never the client — decides where you land.
 */

export type LoginRole = "teacher" | "student";

export interface LoginResult {
  ok: boolean;
  redirect?: string;
  error?: string;
}

function homeFor(role: "teacher" | "student" | "counselor"): string {
  if (role === "teacher") return "/lessons";
  if (role === "counselor") return "/escalations";
  return "/courses";
}

/** Sign in with a password. `role` is the door the user picked, enforced below. */
export async function signInWithPassword(
  email: string,
  password: string,
  role: LoginRole,
): Promise<LoginResult> {
  if (email.trim().length === 0 || password.length === 0) {
    return { ok: false, error: "Enter your email and password." };
  }
  // Throttle per (ip, email) so a bad actor can't brute-force one account or spray.
  const gate = hit(`signin:${await clientIp()}:${email.trim().toLowerCase()}`, 5, 5 * 60_000);
  if (!gate.ok) {
    return { ok: false, error: "Too many attempts. Wait a minute and try again." };
  }
  const account = await verifyCredentials(email, password);
  if (account === null) {
    return { ok: false, error: "That email or password isn’t right." };
  }
  // Respect the chosen door: a student account can't sign in through the teacher
  // screen, and vice-versa. The account's role is authoritative either way.
  if (account.role !== role && account.role !== "counselor") {
    const other = account.role === "teacher" ? "Teacher" : "Student";
    return {
      ok: false,
      error: `That’s a ${account.role} account — use the ${other} login.`,
    };
  }
  await signIn(account.id);
  return { ok: true, redirect: homeFor(account.role) };
}

/** Self-serve student sign-up. Teachers/counselors are provisioned, not self-made. */
export async function signUpStudent(
  email: string,
  password: string,
): Promise<LoginResult> {
  if (email.trim().length === 0) {
    return { ok: false, error: "Enter your school email." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Use a password of at least 8 characters." };
  }
  const gate = hit(`signup:${await clientIp()}`, 3, 10 * 60_000);
  if (!gate.ok) {
    return { ok: false, error: "Too many sign-ups from here. Try again later." };
  }
  try {
    const id = await createStudentAccount(email, password);
    await signIn(id);
    return { ok: true, redirect: "/courses" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sign-up failed." };
  }
}
