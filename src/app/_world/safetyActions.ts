"use server";

import { getSessionStudent } from "./session";
import { CRISIS_TENANT, getSafetyWorld } from "./safetyWorld";

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
  const studentId = await getSessionStudent();
  if (studentId === null || text.trim().length === 0) {
    return { crisis: false };
  }
  const { service } = await getSafetyWorld();
  const result = await service.screen({
    studentId,
    tenantId: CRISIS_TENANT,
    text,
  });
  return { crisis: result.detected !== null };
}
