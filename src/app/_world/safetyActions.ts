"use server";

import { getSessionUser } from "./session";
import { getSafetyWorld } from "./safetyWorld";

/**
 * The crisis capture boundary (P16). Free text submitted by a student is screened
 * here; a hit routes to humans and tells the surface to show the resource screen.
 * This is the sanctioned exception to "data flows to the student" and NEVER
 * consults consent. It builds on the shared safety world (safetyWorld).
 */

/**
 * Screen free text at capture. Returns whether a crisis signal was found (so the
 * surface can show the calm resource screen). The escalation is created and routed
 * server-side; the client learns only the boolean.
 */
export async function screenReflectionText(
  text: string,
): Promise<{ crisis: boolean }> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student" || text.trim().length === 0) {
    return { crisis: false };
  }
  const { service } = await getSafetyWorld();
  // Route by the student's OWN tenant (the same source of truth as RLS), never a
  // hardcoded one — so an alert reaches that school's designated counselor.
  const result = await service.screen({
    studentId: user.id,
    tenantId: user.tenantId,
    text,
  });
  return { crisis: result.detected !== null };
}
