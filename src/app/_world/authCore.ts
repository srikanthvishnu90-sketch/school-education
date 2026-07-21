import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
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
 * ELEVATED roles (teacher, counselor) are fixed here — they see more than their
 * own data, so they are never self-served. Any other real email SELF-SIGNS-UP as a
 * student: safe because plumb is a personal instrument with per-student RLS
 * isolation (a self-served student is enrolled in no class, so they are invisible
 * to every teacher/aggregate view) and no payments. The student id is DERIVED from
 * the email, so the same email always maps to the same account with zero storage.
 */
const KNOWN_ROLES: readonly AuthUser[] = [
  { email: "avery@demo.school", id: "student-avery", role: "student" },
  { email: "blake@demo.school", id: "student-blake", role: "student" },
  { email: "casey@demo.school", id: "student-casey", role: "student" },
  // Elevated demo roles use the SAME emails as the password store (credentials.ts)
  // and the on-screen demo hints, so the documented account logs into the right role
  // through the live magic-link door — never silently self-serves as a student.
  { email: "rivera@demo.school", id: TEACHER_ID, role: "teacher" },
  { email: "okafor@demo.school", id: COUNSELOR_ID, role: "counselor" },
];

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function isPlausibleEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** Deterministic, storage-free student id: same email → same account, always. */
function studentIdForEmail(email: string): string {
  return `student-${createHash("sha256").update(email, "utf8").digest("hex").slice(0, 12)}`;
}

/**
 * The account for an email: a fixed elevated role if one exists, else a
 * self-served student for any plausible email, else null (garbage input).
 */
export function lookupByEmail(email: string): AuthUser | null {
  const e = normalize(email);
  const known = KNOWN_ROLES.find((u) => u.email === e);
  if (known !== undefined) return known;
  if (!isPlausibleEmail(e)) return null;
  return { email: e, id: studentIdForEmail(e), role: "student" };
}

/** True for an email in the pre-provisioned roster (bypasses the pilot gate). */
export function isSeededEmail(email: string): boolean {
  return KNOWN_ROLES.some((u) => u.email === normalize(email));
}

/** Constant-time string equality (avoids leaking the code via response timing). */
function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * The closed-pilot admission gate. A self-served student is admitted only with the
 * pilot's shared access code (PILOT_ACCESS_CODE). When that env var is unset —
 * local dev, demos, tests — the gate is OPEN so self-signup stays frictionless.
 * The seeded roster (demo students, teacher, counselor) always bypasses it.
 *
 * The code is a SHARED pilot secret, not a per-account credential, so rejecting a
 * wrong code reveals nothing about which emails exist — unlike email lookup, which
 * must stay non-enumerable. That is why this gate can answer honestly.
 */
export function pilotGateAccepts(email: string, code: string | undefined): boolean {
  if (isSeededEmail(email)) return true;
  const required = process.env.PILOT_ACCESS_CODE;
  if (required === undefined || required.length === 0) return true;
  return code !== undefined && secretEquals(code.trim(), required);
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

/** The dev sender: logs the link (no key/SMTP), so the flow works locally. */
const devSender: EmailSender = {
  async send(to, link) {
    console.log(`[magic-link] ${to} -> ${link}`);
  },
};

/**
 * The real sender (Resend HTTP API), used automatically when RESEND_API_KEY and
 * EMAIL_FROM are set — no code change needed once the key is provided. The link is
 * made absolute against APP_URL so it works from an email client.
 */
export function createResendSender(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): EmailSender {
  return {
    async send(to, link) {
      const appUrl = process.env.APP_URL;
      const href =
        appUrl !== undefined && appUrl.length > 0
          ? new URL(link, appUrl).toString()
          : link;
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject: "Your plumb sign-in link",
          html:
            `<p>Click to sign in to plumb:</p>` +
            `<p><a href="${href}">${href}</a></p>` +
            `<p>This link works once and expires in 15 minutes. If you didn't ask to sign in, you can ignore this.</p>`,
        }),
      });
      if (!res.ok) {
        throw new Error(`email send failed: ${res.status}`);
      }
    },
  };
}

let override: EmailSender | null = null;

/** Override the sender (tests). */
export function setEmailSender(next: EmailSender): void {
  override = next;
}

/**
 * The active sender: an explicit override, else Resend when configured, else the
 * dev logger. Selected per call so setting the env at runtime takes effect.
 */
export function getEmailSender(): EmailSender {
  if (override !== null) return override;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (key !== undefined && key.length > 0 && from !== undefined && from.length > 0) {
    return createResendSender(key, from);
  }
  return devSender;
}

/**
 * True when the link may be surfaced on-screen for the demo — only when no real
 * email transport is configured (so a real deployment never leaks the link).
 */
export function devLinksVisible(): boolean {
  const hasRealSender =
    (process.env.RESEND_API_KEY ?? "").length > 0 &&
    (process.env.EMAIL_FROM ?? "").length > 0;
  return !hasRealSender && process.env.NODE_ENV !== "production";
}
