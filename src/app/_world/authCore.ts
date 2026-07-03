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
