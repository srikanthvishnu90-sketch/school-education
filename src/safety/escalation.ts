import type { CrisisTier } from "./detector";

/**
 * CrisisEscalation — the record of a routed crisis signal. It carries only what
 * the humans who receive it need, plus an ENCRYPTED, access-restricted reference
 * to the triggering text (`textRef`). It is NEVER read by the agent policy,
 * calibration, or any analytics — this type lives in src/safety and is imported
 * only at the capture boundary and the counselor surface.
 */

export interface CrisisEscalation {
  id: string;
  studentId: string;
  tenantId: string;
  tier: CrisisTier;
  /** Sealed (encrypted) student text. Access-restricted by RLS to the counselor role. */
  textRef: string;
  detectorVersion: string;
  createdAt: Date;
  /** Contact handles this escalation was delivered to; empty until delivered. */
  deliveredTo: string[];
  /** When delivery succeeded; null while undelivered. */
  deliveredAt: Date | null;
  /** When a counselor acknowledged; null until then. Stops retries. */
  acknowledgedAt: Date | null;
  /** The counselor id that acknowledged; null until then. */
  acknowledgedBy: string | null;
  /**
   * True when no designated contact was configured: the escalation persists,
   * flagged, and the operator channel is alerted. It is NEVER silently dropped.
   */
  undelivered: boolean;
  /** How many delivery attempts have been made (drives escalating urgency). */
  attempts: number;
  lastAttemptAt: Date;
}

export type DeliveryUrgency = "elevated" | "high" | "critical";

/**
 * Delivery urgency: tier_1 starts one notch above tier_2, and every retry
 * escalates further. Unacknowledged crises get louder, never quieter.
 */
export function deliveryUrgency(
  tier: CrisisTier,
  attempts: number,
): DeliveryUrgency {
  const base = tier === "tier_1" ? 1 : 0;
  const level = base + Math.max(0, attempts - 1);
  if (level <= 0) return "elevated";
  if (level === 1) return "high";
  return "critical";
}

/** An escalation still needs delivery/retry until a counselor acknowledges it. */
export function isPending(escalation: CrisisEscalation): boolean {
  return escalation.acknowledgedAt === null;
}
