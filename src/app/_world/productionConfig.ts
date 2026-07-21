/**
 * Production configuration guardrails. plumb screens minors' free text for crisis
 * signals and promises a human will be told. In production it must therefore refuse
 * to run on missing or insecure configuration rather than fail silently — a crisis
 * screener on an all-zero key or an ephemeral store is worse than an honest refusal.
 * Dev and test are unaffected.
 */

/**
 * True only for a REAL production deployment — one that serves real students and
 * must therefore be fully configured. On Vercel that means `VERCEL_ENV === "production"`;
 * a Vercel PREVIEW/DEVELOPMENT deploy is a staging/demo URL and is NOT real production,
 * so it may boot on in-memory demo config (letting the UI be viewed without a database).
 * Off Vercel, `NODE_ENV === "production"` is treated as real production (self-host).
 */
export function isProduction(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const onVercel = env.VERCEL === "1" || env.VERCEL_ENV !== undefined;
  return onVercel
    ? env.VERCEL_ENV === "production"
    : env.NODE_ENV === "production";
}

/**
 * Env vars that MUST be set in production. Missing any one → the app refuses to
 * start (see instrumentation.ts → assertProductionConfig).
 */
export const REQUIRED_IN_PRODUCTION = [
  "SESSION_SECRET", // signed session cookies (also enforced at signing time)
  "DATABASE_URL", // durable store — no ephemeral in-memory for real students
  "CRISIS_KEY_HEX", // seals crisis text at rest (no all-zero fallback)
  "REFLECTION_KEY_HEX", // encrypts reflection/chat at rest
  "RESEND_API_KEY", // real email delivery
  "EMAIL_FROM",
  "OPERATOR_EMAIL", // crisis operator-fallback recipient
  "CRON_SECRET", // protects the retry cron
] as const;

/** The required vars that are currently unset/empty. Empty array = fully configured. */
export function missingProductionConfig(env: Record<string, string | undefined> = process.env): string[] {
  return REQUIRED_IN_PRODUCTION.filter((key) => {
    const value = env[key];
    return value === undefined || value.length === 0;
  });
}

/** The all-zero dev crisis key must never be used in production. */
function usesInsecureCrisisKey(env: Record<string, string | undefined> = process.env): boolean {
  const key = env.CRISIS_KEY_HEX ?? "";
  return key.length > 0 && /^0+$/.test(key);
}

/**
 * Refuse to start when production config is missing/insecure. No-op in dev/test.
 * Throwing here (from the boot hook) is the intended "refuse to start" behavior.
 */
export function assertProductionConfig(env: Record<string, string | undefined> = process.env): void {
  // `next build` runs with NODE_ENV=production but the runtime env isn't present
  // yet — never fail the build; only refuse to START a running server.
  if (env.NEXT_PHASE === "phase-production-build") return;
  // Only a REAL production server must be fully configured. A Vercel preview/dev
  // deploy boots on in-memory demo config (see isProduction).
  if (!isProduction(env)) return;

  const missing = missingProductionConfig(env);
  if (missing.length > 0) {
    throw new Error(
      `plumb refuses to start: required production env vars are unset — ${missing.join(", ")}. ` +
        "A crisis screener must never run on missing keys or an ephemeral store.",
    );
  }
  if (usesInsecureCrisisKey(env)) {
    throw new Error(
      "plumb refuses to start: CRISIS_KEY_HEX is the all-zero dev key in production.",
    );
  }
}
