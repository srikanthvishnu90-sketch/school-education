import { NextResponse } from "next/server";
import { createPgClient } from "@/adapters/supabase";
import {
  isProduction,
  missingProductionConfig,
} from "@/app/_world/productionConfig";
import { clientIp, hit } from "@/app/_world/rateLimit";

/**
 * Public health check for uptime monitoring. Reports per-dependency status +
 * latency: Postgres (a cheap query), Resend (read-only reachability, no email
 * sent), Anthropic (only if a key is set), and whether the production config
 * assertions pass. Rate-limited and cached 30s so monitors can't hammer the
 * dependencies. No auth — it exposes only status, never secrets or student data.
 */

export const dynamic = "force-dynamic";

interface Check {
  configured: boolean;
  ok: boolean;
  latencyMs?: number;
  note?: string;
  error?: string;
}

interface Health {
  status: "ok" | "degraded";
  env: "production" | "development";
  checks: {
    config: { ok: boolean; missing: string[] };
    database: Check;
    email: Check;
    anthropic: Check;
  };
  /** A single keyword UptimeRobot can watch: "healthy" or "degraded". */
  crisisPipeline: "healthy" | "degraded";
  at: string;
}

/** A GET with a short timeout — reachability only, never a mutation. */
async function reachable(
  url: string,
  headers: Record<string, string>,
): Promise<Check> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    // Any authenticated response (even 4xx that isn't 401/403) means the API is up.
    const ok = res.status !== 401 && res.status !== 403 && res.status < 500;
    return { configured: true, ok, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.name : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<Check> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    return { configured: false, ok: true, note: "in-memory (no DATABASE_URL)" };
  }
  const start = Date.now();
  const client = createPgClient(url);
  try {
    await client.query("select 1");
    return { configured: true, ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.name : "error",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkEmail(): Promise<Check> {
  const key = process.env.RESEND_API_KEY;
  if (key === undefined || key.length === 0) {
    return { configured: false, ok: true, note: "no RESEND_API_KEY (dev logs email)" };
  }
  // Read-only: listing domains never sends an email.
  return reachable("https://api.resend.com/domains", {
    authorization: `Bearer ${key}`,
  });
}

async function checkAnthropic(): Promise<Check> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key === undefined || key.length === 0) {
    return { configured: false, ok: true, note: "no key (deterministic engine only)" };
  }
  return reachable("https://api.anthropic.com/v1/models", {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  });
}

let cache: { at: number; body: Health } | null = null;
const CACHE_MS = 30_000;

async function compute(): Promise<Health> {
  const prod = isProduction();
  const missing = missingProductionConfig();
  const [database, email, anthropic] = await Promise.all([
    checkDatabase(),
    checkEmail(),
    checkAnthropic(),
  ]);
  const configOk = !prod || missing.length === 0;
  const status: Health["status"] =
    configOk && database.ok && email.ok && anthropic.ok ? "ok" : "degraded";
  // The crisis pipeline needs a durable store and a working notification path.
  const crisisReady =
    database.configured && database.ok && email.configured && email.ok && configOk;
  return {
    status,
    env: prod ? "production" : "development",
    checks: { config: { ok: configOk, missing }, database, email, anthropic },
    crisisPipeline: crisisReady ? "healthy" : "degraded",
    at: new Date().toISOString(),
  };
}

export async function GET(): Promise<NextResponse> {
  if (!(await hit(`health:${await clientIp()}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const now = Date.now();
  if (cache !== null && now - cache.at < CACHE_MS) {
    return NextResponse.json(cache.body, {
      headers: { "cache-control": "public, max-age=30" },
    });
  }
  const body = await compute();
  cache = { at: now, body };
  return NextResponse.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "cache-control": "public, max-age=30" },
  });
}
