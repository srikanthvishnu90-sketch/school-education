/**
 * Next.js boot hook — runs once when the server starts. It's where plumb refuses
 * to start on missing/insecure production config (a crisis screener must not run
 * on absent keys or an ephemeral store). Node runtime only; a no-op in dev/test.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionConfig } = await import("@/app/_world/productionConfig");
    assertProductionConfig();
  }
}
