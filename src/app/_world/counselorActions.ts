"use server";

import { getSessionUser } from "./session";
import { COUNSELOR_ID } from "./roles";
import { recordAudit } from "./auditLog";
import { CRISIS_TENANT, getSafetyWorld } from "./safetyWorld";

/**
 * The counselor surface's data access (P16). The counselor is the district-
 * designated crisis recipient — the ONE role that may read escalations, and
 * nothing else. Both actions refuse anyone who is not the signed-in counselor.
 * The sealed (encrypted) text is never returned to the surface; the counselor
 * sees who, which tier, when, and delivery/acknowledgement state, then follows
 * the district's protocol.
 */

export interface EscalationView {
  id: string;
  studentId: string;
  tier: "tier_1" | "tier_2";
  createdAt: string;
  delivered: boolean;
  undelivered: boolean;
  acknowledged: boolean;
}

async function requireCounselor(): Promise<boolean> {
  const user = await getSessionUser();
  return user !== null && user.role === "counselor";
}

export async function listEscalations(): Promise<EscalationView[]> {
  if (!(await requireCounselor())) return [];
  const { escalations } = await getSafetyWorld();
  const rows = await escalations.listByTenant(CRISIS_TENANT);
  // Reading crisis escalations exposes at-risk students by name — record each.
  for (const e of rows) {
    recordAudit({
      actorId: COUNSELOR_ID,
      actorRole: "counselor",
      action: "view_escalation",
      studentId: e.studentId,
      at: new Date(),
    });
  }
  return rows
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((e) => ({
      id: e.id,
      studentId: e.studentId,
      tier: e.tier,
      createdAt: e.createdAt.toISOString(),
      delivered: e.deliveredAt !== null,
      undelivered: e.undelivered,
      acknowledged: e.acknowledgedAt !== null,
    }));
}

export async function acknowledgeEscalation(
  escalationId: string,
): Promise<{ ok: boolean }> {
  if (!(await requireCounselor())) return { ok: false };
  const { service } = await getSafetyWorld();
  await service.acknowledge(escalationId, COUNSELOR_ID);
  return { ok: true };
}
