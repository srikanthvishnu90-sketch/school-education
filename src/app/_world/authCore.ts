import { randomUUID } from "node:crypto";
import { TEACHER_ID } from "./teacher";
import { COUNSELOR_ID } from "./roles";

/**
 * Magic-link auth (real sign-in for provisioned pilot accounts). School pilots
 * provision participants ahead of time — a student/teacher/counselor account is
 * created for a known email — so sign-in is "prove you own the email tied to your
 * account", not self-signup. This is the mechanism; the transport (email) is a
 * pluggable port so a real sender (Resend/SMTP) drops in for production.
 *
 * Plain module (NOT "use server"): it exports stores, types, and helpers, which a
 * "use server" module may not. The server actions live in authActions.
 */

export type UserRole = "student" | "teacher" | "counselor";

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
}

/**
 * The provisioned participant directory. Emails map to the existing seeded roles
 * so magic-link logs into the same worlds the demo pickers do. A real deployment
 * populates this from the district roster; unknown emails are simply not found
 * (self-signup is deferred — it needs world provisioning + real outcomes).
 */
const DIRECTORY: readonly AuthUser[] = [
  { email: "avery@demo.school", id: "student-avery", role: "student" },
  { email: "blake@demo.school", id: "student-blake", role: "student" },
  { email: "casey@demo.school", id: "student-casey", role: "student" },
  { email: "teacher@demo.school", id: TEACHER_ID, role: "teacher" },
  { email: "counselor@demo.school", id: COUNSELOR_ID, role: "counselor" },
];

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function lookupByEmail(email: string): AuthUser | null {
  const e = normalize(email);
  return DIRECTORY.find((u) => u.email === e) ?? null;
}

// --- One-time tokens ---------------------------------------------------------

interface MagicToken {
  email: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 15 * 60 * 1000;

// Pinned to globalThis: Next bundles server actions (mint) and route handlers
// (consume) into separate module layers, so a plain module-level Map would not be
// shared between them. One global store keeps the token usable across the boundary.
const globalStore = globalThis as unknown as {
  __plumbMagicTokens?: Map<string, MagicToken>;
};
const tokens: Map<string, MagicToken> = (globalStore.__plumbMagicTokens ??=
  new Map<string, MagicToken>());

/** Mint a single-use token bound to an email. */
export function mintToken(email: string, now: number = Date.now()): string {
  const token = randomUUID();
  tokens.set(token, { email: normalize(email), expiresAt: now + TOKEN_TTL_MS });
  return token;
}

/** Consume a token, returning its email if valid and unexpired (single use). */
export function consumeToken(
  token: string,
  now: number = Date.now(),
): string | null {
  const entry = tokens.get(token);
  if (entry === undefined) return null;
  tokens.delete(token); // single use, even if expired
  if (entry.expiresAt < now) return null;
  return entry.email;
}

// --- Email transport (pluggable) ---------------------------------------------

export interface EmailSender {
  send(to: string, link: string): Promise<void>;
}

/**
 * The default dev sender: it logs the link (no SMTP required) so the flow is
 * usable locally. Production swaps in a real sender via `setEmailSender`.
 */
let sender: EmailSender = {
  async send(to, link) {
    console.log(`[magic-link] ${to} -> ${link}`);
  },
};

export function setEmailSender(next: EmailSender): void {
  sender = next;
}

export function getEmailSender(): EmailSender {
  return sender;
}

/** True in non-production, where the link may be surfaced on-screen for the demo. */
export function devLinksVisible(): boolean {
  return process.env.NODE_ENV !== "production";
}
