import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session tokens — the cookie is NOT the raw user id. It is `id.HMAC(id)` signed
 * with a server-only secret, so a browser cannot forge a session by setting the
 * cookie to a known id (e.g. "teacher-1"). Verification is constant-time; a
 * tampered or unsigned value fails and is treated as no session.
 *
 * In production SESSION_SECRET MUST be set — otherwise sessions are forgeable by
 * anyone who knows the dev fallback. The app refuses to trust the fallback when
 * NODE_ENV is production.
 */

const DEV_SECRET = "plumb-dev-session-secret-not-for-production";

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv !== undefined && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set (>=16 chars) in production — refusing to sign sessions with the dev fallback.",
    );
  }
  return DEV_SECRET;
}

function mac(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

/** Produce the signed cookie value for a user id. */
export function signSession(id: string): string {
  return `${id}.${mac(id)}`;
}

/** Recover the user id from a signed cookie, or null if unsigned/tampered. */
export function verifySession(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = mac(id);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? id : null;
}
