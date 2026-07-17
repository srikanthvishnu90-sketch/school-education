import { afterEach, describe, expect, it } from "vitest";

import {
  createEmailCrisisDeliveryChannel,
  createEmailOperatorChannel,
} from "@/app/_world/safetyChannels";
import {
  createAesCipher,
  createCrisisEscalationRepository,
  createCrisisSafetyService,
  createTenantProtocolRepository,
} from "@/safety";

const KEY = Buffer.alloc(32, 7);

// Restore only the env we touch, so other suites are unaffected.
const TOUCHED = ["VERCEL_ENV", "RESEND_API_KEY", "EMAIL_FROM", "OPERATOR_EMAIL"] as const;
const saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("crisis email delivery in production", () => {
  it("unconfigured Resend in production → escalation is undelivered + retry-eligible, never delivered", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.OPERATOR_EMAIL; // operator channel logs (best-effort, never throws)

    const escalations = createCrisisEscalationRepository();
    const protocols = createTenantProtocolRepository();
    await protocols.save({
      tenantId: "t1",
      contacts: [{ id: "c1", role: "counselor", handle: "c@school.test" }],
      channel: "email",
    });
    let t = Date.UTC(2026, 6, 3, 12, 0, 0);
    let n = 0;
    const service = createCrisisSafetyService({
      now: () => {
        t += 60_000;
        return new Date(t);
      },
      nextId: () => `esc-${++n}`,
      cipher: createAesCipher(KEY),
      escalations,
      protocols,
      delivery: createEmailCrisisDeliveryChannel(),
      operator: createEmailOperatorChannel(),
    });

    const { escalation } = await service.screen({
      studentId: "s1",
      tenantId: "t1",
      text: "i want to kill myself",
    });

    // Never falsely "delivered" — flagged undelivered and left on the retry work-list.
    expect(escalation?.undelivered).toBe(true);
    expect(escalation?.deliveredAt).toBeNull();
    expect(await escalations.listPending()).toHaveLength(1);
  });

  it("dev without Resend still logs and does NOT throw (delivery treated as sent)", async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const channel = createEmailCrisisDeliveryChannel();
    await expect(
      channel.deliver({
        escalation: {} as never,
        contacts: [{ id: "c1", role: "counselor", handle: "c@school.test" }],
        tier: "tier_1",
        urgency: "high",
      }),
    ).resolves.toBeUndefined();
  });
});
