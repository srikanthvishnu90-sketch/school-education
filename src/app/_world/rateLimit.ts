import { headers } from "next/headers";

/**
 * A fixed-window rate limiter to blunt brute-force and abuse on the sensitive
 * actions (password sign-in, magic-link minting, sign-up, chat messages). It is
 * process-local (a Map), so on a multi-instance deploy each instance enforces its
 * own share — a real deployment fronts this with a shared store (Redis) or an
 * edge limiter. It is a meaningful floor, not the whole story.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimit {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when !ok). */
  retryAfter: number;
}

/**
 * Record one hit against `key`. Returns ok=false once `limit` hits occur within
 * `windowMs`. Time comes from Date.now() — this is app code, not a workflow.
 */
export function hit(key: string, limit: number, windowMs: number): RateLimit {
  const now = Date.now();
  const w = windows.get(key);
  if (w === undefined || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** A best-effort client key from the forwarded IP, for per-caller limits. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd !== null && fwd.length > 0) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
