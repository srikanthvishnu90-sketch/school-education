"use server";

import { getSessionStudent } from "./session";
import { getWorld } from "./world";
import { recordAudit } from "./auditLog";

/**
 * Data-subject rights (FERPA/COPPA right-to-erasure). A student can delete their
 * own reflection record: every session (chat text), summary, and score is hard-
 * deleted, affect consent is revoked (which the ConsentService deletes + receipts),
 * and the erasure is audit-logged. This is the reachable deletion capability a data
 * processing agreement requires.
 */

export interface EraseResult {
  ok: boolean;
  deleted: { sessions: number; summaries: number; performances: number };
}

export async function eraseMyReflectionData(): Promise<EraseResult> {
  const studentId = await getSessionStudent();
  if (studentId === null) {
    return { ok: false, deleted: { sessions: 0, summaries: 0, performances: 0 } };
  }
  const world = await getWorld();

  const [sessions, summaries, performances] = await Promise.all([
    world.intel.sessions.deleteByStudent(studentId),
    world.intel.studentSummaries.deleteByStudent(studentId),
    world.intel.performances.deleteByStudent(studentId),
  ]);

  // Revoke affect consent — the ConsentService hard-deletes affect rows and writes
  // a deletion receipt, so the withdrawal is itself on record.
  await world.consentService.revoke({ studentId, scopes: ["affect"] });

  recordAudit({
    actorId: studentId,
    actorRole: "student",
    action: "erase_data",
    studentId,
    at: world.clock.now(),
  });

  return { ok: true, deleted: { sessions, summaries, performances } };
}
