import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_GOLDEN,
  PINNED_MODELS,
  SKILL_GOLDEN,
  RENDER_GOLDEN,
  asAsync,
  comparisonTable,
  createDeterministicLanguageCapability,
  createFakeGateway,
  createLlmLanguageCapability,
  driftCheck,
  evalCapability,
  regressionGate,
  type GatewayDeps,
  type Report,
} from "@/adapters/language";

/**
 * The eval harness: it scores capabilities against the checked-in golden sets,
 * runs BOTH impls and prints the comparison table, gates the model per task by a
 * margin, and trips a drift check when the pinned model strings change.
 */

const DEPS: GatewayDeps = {
  models: PINNED_MODELS,
  now: () => new Date("2026-07-01T00:00:00Z"),
};

const deterministic = createDeterministicLanguageCapability();
const baselineCap = asAsync(deterministic);

describe("evalCapability over the golden sets", () => {
  it("scores every task over the full golden set", async () => {
    const report = await evalCapability(baselineCap);
    expect(report.classify.n).toBe(ATTRIBUTION_GOLDEN.length);
    expect(report.tag.n).toBe(SKILL_GOLDEN.length);
    expect(report.render.n).toBe(RENDER_GOLDEN.length);
    // The deterministic baseline is honestly strong on its own rule set.
    expect(report.classify.score).toBeGreaterThan(0.7);
    expect(report.render.score).toBe(1); // pure slot fill always keeps the info
  });

  it("runs BOTH impls and prints the comparison table", async () => {
    // The model path, wired to a fake gateway (no network): it echoes a fixed
    // valid enum, one skill id, and the deterministic phrasing.
    const modelCap = createLlmLanguageCapability({
      gateway: createFakeGateway((r) => {
        if (r.task === "classify") return "strategy";
        if (r.task === "tag") return "skill-linear-equations";
        return r.prompt; // render: echo the already-rendered deterministic text
      }, DEPS),
      fallback: deterministic,
    });

    const baseline = await evalCapability(baselineCap);
    const candidate = await evalCapability(modelCap);
    const table = comparisonTable(baseline, candidate, 0.05);

    console.log("\n" + table);
    expect(table).toContain("classify");
    expect(table).toMatch(/deterministic|model/);
  });
});

describe("regression gate", () => {
  const baseline: Report = {
    classify: { n: 30, score: 0.8 },
    tag: { n: 10, score: 0.9 },
    render: { n: 5, score: 1 },
  };

  it("grants a task only when the candidate beats the baseline by the margin", () => {
    const better: Report = {
      classify: { n: 30, score: 0.9 }, // +0.10 ≥ margin → model
      tag: { n: 10, score: 0.92 }, // +0.02 < margin → deterministic
      render: { n: 5, score: 1 }, // tie → deterministic
    };
    expect(regressionGate(baseline, better, 0.05)).toEqual({
      classify: true,
      tag: false,
      render: false,
    });
  });

  it("routes a regressed candidate entirely to deterministic (the gate flips)", () => {
    const worse: Report = {
      classify: { n: 30, score: 0.5 },
      tag: { n: 10, score: 0.4 },
      render: { n: 5, score: 0.6 },
    };
    expect(regressionGate(baseline, worse, 0.05)).toEqual({
      classify: false,
      tag: false,
      render: false,
    });
  });
});

describe("drift check", () => {
  const expected = {
    classify: "claude-haiku-4-5",
    tag: "claude-haiku-4-5",
    render: "claude-sonnet-4-6",
  };

  it("passes when the pinned models are unchanged", () => {
    const actual = {
      classify: PINNED_MODELS.classify.model,
      tag: PINNED_MODELS.tag.model,
      render: PINNED_MODELS.render.model,
    };
    expect(driftCheck(actual, expected)).toEqual({ ok: true, drifted: [] });
    // Guards the pinned strings themselves against silent edits.
    expect(actual).toEqual(expected);
  });

  it("trips when a model string changes, forcing a re-eval", () => {
    const swapped = { ...expected, render: "claude-opus-4-8" };
    expect(driftCheck(swapped, expected)).toEqual({
      ok: false,
      drifted: ["render"],
    });
  });
});
