import { describe, expect, it } from "vitest";

import {
  abandonmentByScreen,
  affectSkipRate,
  calibrationDelta,
  followThroughRate,
  honestEngagementRate,
  pilotEventSchema,
  returnRate,
  timePerCycle,
  type PilotEvent,
  type ReturnOpportunity,
} from "@/domain";

/**
 * Pilot telemetry measures MECHANICS, never content: the event schema is strict
 * (no free text can be smuggled in), and the measurement queries answer the
 * pilot's questions with honest, min-n-gated denominators.
 */

const MIN2 = { minN: 2, windowMs: 14 * 86_400_000, budgetMs: 180_000 };

function ev(e: Partial<PilotEvent> & { type: PilotEvent["type"] }): PilotEvent {
  return {
    studentId: "p-x",
    tenantId: "school-1",
    cycleN: 1,
    at: new Date("2026-07-01T00:00:00Z"),
    ...e,
  };
}

describe("pilotEventSchema — no free text can be smuggled in", () => {
  it("accepts a valid mechanics-only event", () => {
    expect(
      pilotEventSchema.safeParse({
        studentId: "p-1",
        tenantId: "school-1",
        type: "cycle_completed",
        elapsedInCycleMs: 120_000,
        cycleN: 1,
        at: new Date(),
      }).success,
    ).toBe(true);
  });

  it("REJECTS an unknown key (a smuggled free-text note)", () => {
    expect(
      pilotEventSchema.safeParse({
        studentId: "p-1",
        tenantId: "school-1",
        type: "reflection_completed",
        cycleN: 1,
        at: new Date(),
        note: "I felt terrible about the slope question",
      }).success,
    ).toBe(false);
  });

  it("REJECTS a screenId outside the closed enum", () => {
    expect(
      pilotEventSchema.safeParse({
        studentId: "p-1",
        tenantId: "school-1",
        type: "cycle_abandoned",
        screenId: "some_free_text_screen",
        cycleN: 1,
        at: new Date(),
      }).success,
    ).toBe(false);
  });
});

describe("returnRate — the denominator excludes students with no opportunity", () => {
  it("counts only students who had an eligible chance to return", () => {
    const events: PilotEvent[] = [
      ev({ studentId: "A", type: "cycle_completed", cycleN: 1, at: new Date("2026-07-01T00:00:00Z") }),
      ev({ studentId: "A", type: "cycle_completed", cycleN: 2, at: new Date("2026-07-05T00:00:00Z") }),
      ev({ studentId: "B", type: "cycle_completed", cycleN: 1, at: new Date("2026-07-01T00:00:00Z") }),
      // C completed cycle 1 but had NO eligible next assessment → not an opportunity.
      ev({ studentId: "C", type: "cycle_completed", cycleN: 1, at: new Date("2026-07-01T00:00:00Z") }),
    ];
    const opportunities: ReturnOpportunity[] = [
      { studentId: "A", afterCycleN: 1, eligibleAt: new Date("2026-07-02T00:00:00Z") },
      { studentId: "B", afterCycleN: 1, eligibleAt: new Date("2026-07-02T00:00:00Z") },
    ];
    const m = returnRate(events, opportunities, MIN2);
    expect(m.value).toEqual({ numerator: 1, denominator: 2 }); // A returned, B didn't; C excluded
    expect(m.grade).toBe("associational");
  });

  it("is insufficient_n below the threshold", () => {
    const m = returnRate([], [{ studentId: "A", afterCycleN: 1, eligibleAt: new Date() }], MIN2);
    expect(m.grade).toBe("insufficient_n");
  });
});

describe("other measurements", () => {
  it("honest-engagement: non-quarantined completion rate", () => {
    const events: PilotEvent[] = [
      ev({ studentId: "A", type: "cycle_completed", cycleN: 1 }),
      ev({ studentId: "A", type: "cycle_completed", cycleN: 2 }),
      ev({ studentId: "A", type: "session_quarantined", cycleN: 2 }),
      ev({ studentId: "B", type: "cycle_completed", cycleN: 1 }),
    ];
    expect(honestEngagementRate(events, MIN2).value).toBeCloseTo(2 / 3);
  });

  it("affect skip rate: overall and by-cycle trend (skip is healthy, tracked not fought)", () => {
    const events: PilotEvent[] = [
      ev({ type: "affect_skipped", cycleN: 1 }),
      ev({ type: "affect_completed", cycleN: 1 }),
      ev({ type: "affect_skipped", cycleN: 2 }),
    ];
    const m = affectSkipRate(events, MIN2);
    expect(m.value?.overall).toBeCloseTo(2 / 3);
    expect(m.value?.trend).toEqual([
      { cycleN: 1, rate: 0.5, n: 2 },
      { cycleN: 2, rate: 1, n: 1 },
    ]);
  });

  it("time-per-cycle vs the 3-minute budget", () => {
    const events: PilotEvent[] = [
      ev({ type: "cycle_completed", elapsedInCycleMs: 120_000 }),
      ev({ type: "cycle_completed", elapsedInCycleMs: 200_000 }),
    ];
    const m = timePerCycle(events, MIN2);
    expect(m.value?.medianMs).toBe(160_000);
    expect(m.value?.withinBudget).toBe(0.5);
  });

  it("abandonment by screen × elapsed", () => {
    const events: PilotEvent[] = [
      ev({ type: "cycle_abandoned", screenId: "reflect_probe", elapsedInCycleMs: 5_000 }),
      ev({ type: "cycle_abandoned", screenId: "reflect_commit", elapsedInCycleMs: 150_000 }),
    ];
    const rows = abandonmentByScreen(events);
    expect(rows.find((r) => r.screenId === "reflect_probe")?.medianElapsedMs).toBe(5_000);
    expect(rows.find((r) => r.screenId === "reflect_commit")?.medianElapsedMs).toBe(150_000);
  });

  it("calibration delta across cycles is min-n gated", () => {
    const series = [
      { studentId: "A", biases: [0.4, 0.1] }, // |0.1|-|0.4| = -0.3
      { studentId: "B", biases: [0.2, 0.25] }, // +0.05
      { studentId: "C", biases: [0.3] }, // single cycle → ignored
    ];
    expect(calibrationDelta(series, MIN2).value).toBeCloseTo(-0.125);
    expect(calibrationDelta(series, { ...MIN2, minN: 3 }).grade).toBe("insufficient_n");
  });

  it("follow-through: fraction of re-engagements acted on", () => {
    const events: PilotEvent[] = [
      ev({ studentId: "A", type: "reengagement_shown", cycleN: 1 }),
      ev({ studentId: "A", type: "reengagement_acted", cycleN: 1 }),
      ev({ studentId: "B", type: "reengagement_shown", cycleN: 1 }),
    ];
    expect(followThroughRate(events, MIN2).value).toBe(0.5);
  });
});
