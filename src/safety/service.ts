import { detectCrisis, type CrisisDetection } from "./detector";
import {
  deliveryUrgency,
  isPending,
  type CrisisEscalation,
} from "./escalation";
import type {
  CrisisCipher,
  CrisisDeliveryChannel,
  CrisisEscalationRepository,
  OperatorAlertChannel,
  TenantProtocolRepository,
} from "./ports";

/**
 * The crisis safety service — the ONE sanctioned exception to "data flows to the
 * student" (P16), grounded in the district's legal duty of care. It is a ROUTER
 * to humans, never a counselor: no advice, no dialogue, no assessment.
 *
 * Invariants enforced here, not by convention:
 *  · Consent is NEVER consulted. A revoked academic/affect scope does not silence
 *    a crisis — the duty of care overrides data-minimization for this path only.
 *  · An escalation is NEVER silently dropped. No designated contact → the operator
 *    channel is alerted and the escalation persists, flagged undelivered.
 *  · Retries escalate urgency until a counselor acknowledges.
 *  · The triggering text is SEALED (encrypted) before storage.
 */

export interface CrisisSafetyDeps {
  now: () => Date;
  nextId: () => string;
  cipher: CrisisCipher;
  escalations: CrisisEscalationRepository;
  protocols: TenantProtocolRepository;
  delivery: CrisisDeliveryChannel;
  operator: OperatorAlertChannel;
}

export interface ScreenInput {
  studentId: string;
  tenantId: string;
  /** The free text being captured (reflection note / attribution note). */
  text: string;
}

export interface ScreenResult {
  detected: CrisisDetection | null;
  escalation: CrisisEscalation | null;
}

export interface CrisisSafetyService {
  /**
   * Screen free text at a capture boundary. On a hit, an escalation is created,
   * the text sealed, and delivery attempted immediately — regardless of consent.
   * Returns the detection so the surface can show the resource screen.
   */
  screen(input: ScreenInput): Promise<ScreenResult>;
  /** Re-attempt every pending (unacknowledged) escalation, with escalating urgency. */
  retryPending(): Promise<number>;
  /** A counselor acknowledges an escalation, stopping its retries. */
  acknowledge(escalationId: string, counselorId: string): Promise<CrisisEscalation>;
}

export function createCrisisSafetyService(
  deps: CrisisSafetyDeps,
): CrisisSafetyService {
  /** Attempt delivery for an escalation, mutating its delivery/attempt fields. */
  async function attempt(escalation: CrisisEscalation): Promise<CrisisEscalation> {
    const now = deps.now();
    const attempts = escalation.attempts + 1;
    const urgency = deliveryUrgency(escalation.tier, attempts);
    const protocol = await deps.protocols.find(escalation.tenantId);
    const contacts = protocol?.contacts ?? [];

    if (contacts.length === 0) {
      // Never silently drop: alert the operator and persist, flagged undelivered.
      await deps.operator.alert({
        escalationId: escalation.id,
        tenantId: escalation.tenantId,
        reason: "no designated crisis contact configured for tenant",
        urgency,
        at: now,
      });
      const updated: CrisisEscalation = {
        ...escalation,
        undelivered: true,
        attempts,
        lastAttemptAt: now,
      };
      await deps.escalations.save(updated);
      return updated;
    }

    await deps.delivery.deliver({
      escalation,
      contacts,
      tier: escalation.tier,
      urgency,
    });
    const updated: CrisisEscalation = {
      ...escalation,
      deliveredTo: contacts.map((c) => c.handle),
      deliveredAt: now,
      undelivered: false,
      attempts,
      lastAttemptAt: now,
    };
    await deps.escalations.save(updated);
    return updated;
  }

  return {
    async screen(input: ScreenInput): Promise<ScreenResult> {
      const detected = detectCrisis(input.text);
      if (detected === null) return { detected: null, escalation: null };

      const now = deps.now();
      const base: CrisisEscalation = {
        id: deps.nextId(),
        studentId: input.studentId,
        tenantId: input.tenantId,
        tier: detected.tier,
        textRef: deps.cipher.seal(input.text),
        detectorVersion: detected.detectorVersion,
        createdAt: now,
        deliveredTo: [],
        deliveredAt: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        undelivered: false,
        attempts: 0,
        lastAttemptAt: now,
      };
      await deps.escalations.save(base);
      const escalation = await attempt(base);
      return { detected, escalation };
    },

    async retryPending(): Promise<number> {
      const pending = (await deps.escalations.listPending()).filter(isPending);
      for (const escalation of pending) {
        await attempt(escalation);
      }
      return pending.length;
    },

    async acknowledge(
      escalationId: string,
      counselorId: string,
    ): Promise<CrisisEscalation> {
      const existing = await deps.escalations.findById(escalationId);
      if (existing === null) {
        throw new Error(`crisis escalation ${escalationId} not found`);
      }
      const acknowledged: CrisisEscalation = {
        ...existing,
        acknowledgedAt: deps.now(),
        acknowledgedBy: counselorId,
      };
      await deps.escalations.save(acknowledged);
      return acknowledged;
    },
  };
}
