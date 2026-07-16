import { afterEach, describe, expect, it } from "vitest";

import {
  gateTask,
  isTaskHealthy,
  recordTaskOutcome,
  resetTaskHealth,
  taskHealthSummary,
  taskHealthVersion,
} from "@/domain/intelligence/taskHealth";

afterEach(() => resetTaskHealth());

/** Feed a run of identical outcomes for a task. */
function feed(task: "analyze" | "generate", accepted: boolean, n: number): void {
  for (let i = 0; i < n; i += 1) recordTaskOutcome(task, accepted);
}

describe("task health monitor", () => {
  it("presumes health before there is enough evidence", () => {
    expect(isTaskHealthy("analyze")).toBe(true);
    feed("analyze", false, 3); // below MIN_SAMPLES
    expect(isTaskHealthy("analyze")).toBe(true);
    expect(gateTask("analyze").run).toBe(true);
  });

  it("throttles a task once acceptance falls below the floor", () => {
    feed("analyze", false, 10); // 0% acceptance over the window
    expect(isTaskHealthy("analyze")).toBe(false);
    // Immediately after throttling, the model is skipped (no probe yet).
    expect(gateTask("analyze").run).toBe(false);
  });

  it("bumps the version on a health transition, for audit", () => {
    const before = taskHealthVersion();
    feed("analyze", false, 10);
    expect(taskHealthVersion()).toBeGreaterThan(before);
  });

  it("lets a recovery probe through periodically while throttled", () => {
    feed("analyze", false, 10);
    let probed = false;
    // Within a bounded number of skips, exactly one probe is allowed through.
    for (let i = 0; i < 12; i += 1) {
      const g = gateTask("analyze");
      if (g.run) {
        expect(g.probe).toBe(true);
        probed = true;
        break;
      }
    }
    expect(probed).toBe(true);
  });

  it("recovers: a healthy run of outcomes clears the throttle", () => {
    feed("analyze", false, 10);
    expect(isTaskHealthy("analyze")).toBe(false);
    feed("analyze", true, 20); // window fills with accepts
    expect(isTaskHealthy("analyze")).toBe(true);
    expect(gateTask("analyze").run).toBe(true);
  });

  it("tracks tasks independently and reports a summary", () => {
    feed("analyze", false, 10);
    feed("generate", true, 10);
    const rows = taskHealthSummary();
    expect(rows.find((r) => r.task === "analyze")?.healthy).toBe(false);
    expect(rows.find((r) => r.task === "generate")?.healthy).toBe(true);
  });
});
