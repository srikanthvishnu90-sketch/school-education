import { describe, expect, it } from "vitest";

import {
  createAesCipher,
  createCrisisEscalationRepository,
  createCrisisSafetyService,
  createRecordingDeliveryChannel,
  createRecordingOperatorChannel,
  createTenantProtocolRepository,
  type CrisisContact,
  type CrisisSafetyDeps,
} from "@/safety";

/**
 * The crisis safety service: consent-independent escalation, immediate delivery
 * with an audit trail, never-silently-dropped when no contact is configured, and
 * escalating retries until acknowledged. The text is sealed (encrypted) at rest.
 */

const KEY = Buffer.alloc(32, 7);
const COUNSELOR: CrisisContact = { id: "c-1", role: "counselor", handle: "counselor@school" };

function makeService(opts?: {
  contacts?: CrisisContact[];
  start?: number;
}) {
  const escalations = createCrisisEscalationRepository();
  const protocols = createTenantProtocolRepository();
  const delivery = createRecordingDeliveryChannel();
  const operator = createRecordingOperatorChannel();
  let t = opts?.start ?? Date.UTC(2026, 6, 3, 12, 0, 0);
  let n = 0;
  const deps: CrisisSafetyDeps = {
    now: () => {
      t += 60_000; // each read advances a minute — deterministic, injected
      return new Date(t);
    },
    nextId: () => `esc-${++n}`,
    cipher: createAesCipher(KEY),
    escalations,
    protocols,
    delivery,
    operator,
  };
  const service = createCrisisSafetyService(deps);
  return { service, escalations, protocols, delivery, operator, contacts: opts?.contacts };
}

describe("screen", () => {
  it("no signal → no detection, no escalation", async () => {
    const { service, escalations } = makeService();
    const result = await service.screen({
      studentId: "stu-1",
      tenantId: "school-1",
      text: "I flipped my slope fraction the wrong way",
    });
    expect(result.detected).toBeNull();
    expect(result.escalation).toBeNull();
    expect(await escalations.listByTenant("school-1")).toHaveLength(0);
  });

  it("tier_1 → escalation created, delivered to the designated contact, sealed text, audit row", async () => {
    const { service, protocols, delivery, escalations } = makeService();
    await protocols.save({ tenantId: "school-1", contacts: [COUNSELOR], channel: "pager" });

    const result = await service.screen({
      studentId: "stu-1",
      tenantId: "school-1",
      text: "i want to kill myself",
    });

    expect(result.detected?.tier).toBe("tier_1");
    const esc = result.escalation!;
    expect(esc.deliveredAt).not.toBeNull();
    expect(esc.undelivered).toBe(false);
    expect(esc.deliveredTo).toContain("counselor@school");
    // Text is sealed, not plaintext.
    expect(esc.textRef).not.toContain("kill myself");
    expect(createAesCipher(KEY).open(esc.textRef)).toBe("i want to kill myself");
    // Audit trail records the delivery.
    expect(delivery.log()).toHaveLength(1);
    expect(delivery.log()[0].urgency).toBe("high"); // tier_1, first attempt
    expect(await escalations.listByTenant("school-1")).toHaveLength(1);
  });

  it("escalates EVEN when consent is irrelevant — the service never consults consent", async () => {
    // The service has no consent dependency at all; a revoked student still routes.
    const { service, protocols } = makeService();
    await protocols.save({ tenantId: "school-1", contacts: [COUNSELOR], channel: "pager" });
    const result = await service.screen({
      studentId: "revoked-student",
      tenantId: "school-1",
      text: "i have a plan to end my life",
    });
    expect(result.escalation).not.toBeNull();
    expect(result.escalation?.deliveredAt).not.toBeNull();
  });

  it("no configured contact → operator alerted, escalation persists undelivered (never dropped)", async () => {
    const { service, operator, escalations } = makeService();
    const result = await service.screen({
      studentId: "stu-1",
      tenantId: "school-none",
      text: "i want to kill myself",
    });
    expect(result.escalation?.undelivered).toBe(true);
    expect(result.escalation?.deliveredAt).toBeNull();
    expect(operator.log()).toHaveLength(1);
    expect(operator.log()[0].reason).toMatch(/no designated crisis contact/i);
    // It PERSISTS — a crisis is never silently dropped.
    expect(await escalations.listByTenant("school-none")).toHaveLength(1);
  });
});

describe("retry with escalating urgency until acknowledged", () => {
  it("re-attempts pending escalations at higher urgency, then stops on acknowledge", async () => {
    const { service, protocols, delivery, escalations } = makeService();
    await protocols.save({ tenantId: "school-1", contacts: [COUNSELOR], channel: "pager" });

    const { escalation } = await service.screen({
      studentId: "stu-1",
      tenantId: "school-1",
      text: "i want to kill myself",
    });
    expect(delivery.log()[0].urgency).toBe("high");

    // Unacknowledged → a retry fires, louder.
    const retried = await service.retryPending();
    expect(retried).toBe(1);
    expect(delivery.log()[1].urgency).toBe("critical");

    // A counselor acknowledges → no longer pending, no more retries.
    await service.acknowledge(escalation!.id, "c-1");
    expect(await service.retryPending()).toBe(0);

    const acked = await escalations.findById(escalation!.id);
    expect(acked?.acknowledgedAt).not.toBeNull();
    expect(acked?.acknowledgedBy).toBe("c-1");
  });

  it("an undelivered escalation retries and re-alerts the operator until a contact exists", async () => {
    const { service, protocols, operator, delivery } = makeService();
    const { escalation } = await service.screen({
      studentId: "stu-1",
      tenantId: "school-1",
      text: "i want to kill myself",
    });
    expect(escalation?.undelivered).toBe(true);
    expect(operator.log()).toHaveLength(1);

    // The tenant configures a contact; the retry now delivers.
    await protocols.save({ tenantId: "school-1", contacts: [COUNSELOR], channel: "pager" });
    await service.retryPending();
    expect(delivery.log()).toHaveLength(1);
    expect(delivery.log()[0].urgency).toBe("critical"); // escalated over the retries
  });
});
