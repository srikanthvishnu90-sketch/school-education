import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SEED_STUDENTS } from "@/application";
import { COUNSELOR_ID } from "./roles";
import { TEACHER_ID } from "./teacher";

/**
 * Real credential auth — passwords are salted + scrypt-hashed and verified in
 * constant time, never compared as plaintext. This is the authority on WHO an
 * account is and WHAT role it has; the session cookie only carries the id.
 *
 * Storage is an in-memory Map (process lifetime) so the whole app runs with zero
 * infrastructure, exactly like the rest of the demo world. The functions below
 * are the seam: a Postgres or Supabase adapter swaps in behind them later without
 * touching the login surface.
 */

export type AccountRole = "student" | "teacher" | "counselor";

interface Account {
  id: string;
  email: string;
  role: AccountRole;
  salt: string;
  hash: string;
}

const byEmail = new Map<string, Account>();
const byId = new Map<string, Account>();

const KEYLEN = 64;

function derive(password: string, salt: string): Buffer {
  return scryptSync(password, salt, KEYLEN);
}

function put(id: string, email: string, role: AccountRole, password: string): void {
  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    id,
    email: email.toLowerCase(),
    role,
    salt,
    hash: derive(password, salt).toString("hex"),
  };
  byEmail.set(account.email, account);
  byId.set(account.id, account);
}

/** The password every seeded demo account shares — shown on the login screen. */
export const DEMO_PASSWORD = "plumb1234";

let seeded = false;
function ensureSeeded(): void {
  if (seeded) return;
  seeded = true;
  put(TEACHER_ID, "rivera@demo.school", "teacher", DEMO_PASSWORD);
  put(COUNSELOR_ID, "okafor@demo.school", "counselor", DEMO_PASSWORD);
  for (const s of SEED_STUDENTS) {
    const first = s.id.replace(/^student-/, "");
    put(s.id, `${first}@demo.school`, "student", DEMO_PASSWORD);
  }
}

/** The account for these credentials, or null if the email or password is wrong. */
export function verifyCredentials(email: string, password: string): Account | null {
  ensureSeeded();
  const account = byEmail.get(email.trim().toLowerCase());
  if (account === undefined) return null;
  const candidate = derive(password, account.salt);
  const expected = Buffer.from(account.hash, "hex");
  if (candidate.length !== expected.length) return null;
  return timingSafeEqual(candidate, expected) ? account : null;
}

/** The role owning an id, or null. The session uses this so role is never client-set. */
export function roleForId(id: string): AccountRole | null {
  ensureSeeded();
  return byId.get(id)?.role ?? null;
}

export function emailTaken(email: string): boolean {
  ensureSeeded();
  return byEmail.has(email.trim().toLowerCase());
}

function slug(email: string): string {
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Create a new account for a chosen role and return its id. Throws if the email
 * is already registered. Teachers and counselors can't self-provision here — a
 * real deployment gates those; self-signup mints students only.
 */
export function createStudentAccount(email: string, password: string): string {
  ensureSeeded();
  const normalized = email.trim().toLowerCase();
  if (byEmail.has(normalized)) {
    throw new Error("An account with that email already exists.");
  }
  const id = `student-${slug(normalized)}-${randomBytes(3).toString("hex")}`;
  put(id, normalized, "student", password);
  return id;
}
