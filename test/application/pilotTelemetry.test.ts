import { describe, expect, it } from "vitest";

import { createConsentService, createPilotTelemetry } from "@/application";
import {
  createConsentRepository,
  createPilotEventRepository,
  createPseudonymRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createAffectRepository,
} from "@/adapters/memory";

/**
 * Telemetry is itself a consent scope (P17): no `telemetry` scope → ZERO events
 * written. When granted, the stored event carries a PSEUDONYM, never the real id.
 */

function setup() {
  const clock = createSequentialClock(Date.UTC(2026, 6, 1));
  const ids = createSequentialIdGenerator();
  const consentRepo = createConsentRepository();
  const events = createPilotEventRepository();
  const consent = createConsentService({
    clock,
    ids,
    consent: consentRepo,
    affects: createAffectRepository(),
  });
  const telemetry = createPilotTelemetry({
    clock,
    consent: consentRepo,
    pseudonyms: createPseudonymRepository(),
    events,
  });
  return { consent, telemetry, events };
}

describe("consent gate", () => {
  it("writes NOTHING without the telemetry scope", async () => {
    const { telemetry, events } = setup();
    const wrote = await telemetry.record({
      studentId: "student-real-1",
      tenantId: "school-1",
      type: "cycle_completed",
      cycleN: 1,
    });
    expect(wrote).toBe(false);
    expect(await events.list()).toHaveLength(0);
  });

  it("writes a PSEUDONYMIZED event once telemetry is granted", async () => {
    const { consent, telemetry, events } = setup();
    await consent.grant({
      studentId: "student-real-1",
      grantorType: "parent",
      scopes: ["telemetry"],
    });

    const wrote = await telemetry.record({
      studentId: "student-real-1",
      tenantId: "school-1",
      type: "cycle_completed",
      elapsedInCycleMs: 120_000,
      cycleN: 1,
    });
    expect(wrote).toBe(true);

    const stored = await events.list();
    expect(stored).toHaveLength(1);
    // The real id never lands in the event.
    expect(stored[0].studentId).not.toBe("student-real-1");
    expect(stored[0].studentId).not.toContain("student-real");
    expect(stored[0].type).toBe("cycle_completed");
  });

  it("a granted-then-revoked student stops producing events", async () => {
    const { consent, telemetry, events } = setup();
    await consent.grant({
      studentId: "stu-2",
      grantorType: "parent",
      scopes: ["telemetry"],
    });
    await telemetry.record({ studentId: "stu-2", tenantId: "school-1", type: "cycle_started", cycleN: 1 });
    expect(await events.list()).toHaveLength(1);

    await consent.revoke({ studentId: "stu-2", scopes: ["telemetry"] });
    const wrote = await telemetry.record({
      studentId: "stu-2",
      tenantId: "school-1",
      type: "cycle_completed",
      cycleN: 1,
    });
    expect(wrote).toBe(false);
    expect(await events.list()).toHaveLength(1); // no new event after revocation
  });
});
