"use server";

import { getSessionUser } from "./session";
import { getWorld } from "./world";
import { deleteStudyChatsByStudent } from "./studyChat";
import { recordAudit } from "./auditLog";

/**
 * Data-subject rights (FERPA/COPPA right-to-erasure). A student can delete their
 * own reflection record: every session (chat text), summary, score, and the derived
 * skill-calibration data (evidence + calibration records) is hard-deleted, affect
 * consent is revoked (which the ConsentService deletes + receipts),
 * and the erasure is audit-logged. This is the reachable deletion capability a data
 * processing agreement requires.
 */

export interface EraseResult {
  ok: boolean;
  deleted: {
    sessions: number;
    summaries: number;
    performances: number;
    chats: number;
    evidence: number;
    calibrationRecords: number;
  };
}

export async function eraseMyReflectionData(): Promise<EraseResult> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") {
    return {
      ok: false,
      deleted: {
        sessions: 0,
        summaries: 0,
        performances: 0,
        chats: 0,
        evidence: 0,
        calibrationRecords: 0,
      },
    };
  }
  const studentId = user.id;
  const world = await getWorld();

  const [sessions, summaries, performances, chats, evidence, calibrationRecords] =
    await Promise.all([
      world.intel.sessions.deleteByStudent(studentId),
      world.intel.studentSummaries.deleteByStudent(studentId),
      world.intel.performances.deleteByStudent(studentId),
      deleteStudyChatsByStudent(studentId),
      world.intel.evidence.deleteByStudent(studentId),
      world.intel.calibrationRecords.deleteByStudent(studentId),
    ]);

  // Revoke affect consent — the ConsentService hard-deletes affect rows and writes
  // a deletion receipt, so the withdrawal is itself on record.
  await world.consentService.revoke({ studentId, scopes: ["affect"] });

  recordAudit({
    tenantId: user.tenantId,
    actorId: studentId,
    actorRole: "student",
    action: "erase_data",
    studentId,
    at: world.clock.now(),
  });

  return {
    ok: true,
    deleted: {
      sessions,
      summaries,
      performances,
      chats,
      evidence,
      calibrationRecords,
    },
  };
}
