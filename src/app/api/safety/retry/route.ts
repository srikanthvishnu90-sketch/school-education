import { NextResponse } from "next/server";
import { getSafetyWorld } from "@/app/_world/safetyWorld";
import { isProduction } from "@/app/_world/productionConfig";

/**
 * The scheduled retry for the crisis pipeline — re-attempts delivery for any
 * escalation that hasn't been acknowledged (e.g. a counselor email that bounced).
 * Triggered by a Vercel Cron (see vercel.json). Protected by CRON_SECRET so it
 * can't be spammed; Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  // Defense in depth: in production the retry endpoint must be authenticated. If the
  // secret is somehow unset, refuse rather than run unprotected. (The boot guard
  // already requires CRON_SECRET in production; this is the second line.)
  if ((secret === undefined || secret.length === 0) && isProduction()) {
    return new NextResponse("Server misconfigured: CRON_SECRET unset", { status: 500 });
  }
  if (secret !== undefined && secret.length > 0) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }
  const { service } = await getSafetyWorld();
  const retried = await service.retryPending();
  return NextResponse.json({ ok: true, retried });
}
