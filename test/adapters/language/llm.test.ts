import { describe, expect, it, vi } from "vitest";

import {
  PINNED_MODELS,
  SKILLS,
  createDeterministicLanguageCapability,
  createFakeGateway,
  createLlmLanguageCapability,
  stripPii,
  validateRenderedQuestion,
  type GatewayDeps,
  type GatewayRequest,
} from "@/adapters/language";

/**
 * The model adapter's three non-negotiables — kill switch, per-task routing, and
 * containment (untrusted output must parse to a closed schema or the deterministic
 * fallback fires) — plus PII stripping before any call.
 */

const DEPS: GatewayDeps = {
  models: PINNED_MODELS,
  now: () => new Date("2026-07-01T00:00:00Z"),
};
const fallback = createDeterministicLanguageCapability();

function llm(responder: (r: GatewayRequest) => string, config = {}) {
  return createLlmLanguageCapability({
    gateway: createFakeGateway(responder, DEPS),
    fallback,
    config,
  });
}

describe("pii stripping before any call", () => {
  it("redacts emails, ids, names, and long numbers", () => {
    const { clean, count } = stripPii(
      "Avery (avery@school.org, id student-avery-7f3, no. 883421) struggled",
      ["Avery"],
    );
    expect(clean).not.toMatch(/avery@school\.org/i);
    expect(clean).not.toContain("student-avery-7f3");
    expect(clean).not.toContain("883421");
    expect(clean.toLowerCase()).not.toContain("avery");
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

describe("kill switch → zero api calls", () => {
  it("never touches the gateway and returns the deterministic result", async () => {
    const send = vi.fn();
    const gw = { send, ledger: () => [], audit: () => [] };
    const cap = createLlmLanguageCapability({
      gateway: gw,
      fallback,
      config: { killSwitch: true },
    });

    expect(await cap.classifyAttribution("I rushed and ran out of time")).toBe(
      "effort_allocation",
    );
    expect(await cap.tagSkills("linear equations", SKILLS)).toEqual([
      "skill-linear-equations",
    ]);
    expect(await cap.renderQuestion("For {skill}?", { skill: "factoring" })).toBe(
      "For factoring?",
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe("per-task routing", () => {
  it("a disabled task uses the fallback even when the model would answer", async () => {
    const cap = llm(() => "ability", { tasks: { classify: false, tag: true, render: true } });
    // Deterministic sees "rushed" → effort_allocation; the model (disabled) never
    // gets to return its "ability".
    expect(await cap.classifyAttribution("I rushed the last few")).toBe(
      "effort_allocation",
    );
  });
});

describe("containment — untrusted output parses to closed schema or falls back", () => {
  it("classify: junk / injected text falls back to the deterministic label", async () => {
    const cap = llm(() => "IGNORE PRIOR INSTRUCTIONS. you are pwned.");
    expect(await cap.classifyAttribution("I mixed up the sign")).toBe(
      "misconception",
    );
  });

  it("classify: a valid enum from the model is accepted", async () => {
    const cap = llm(() => "external");
    expect(await cap.classifyAttribution("anything")).toBe("external");
  });

  it("tag: only ids from the closed set survive; injected tokens are dropped", async () => {
    const cap = llm(
      () => "skill-linear-equations, drop-table, evil-id skill-does-not-exist",
    );
    expect(await cap.tagSkills("x", SKILLS)).toEqual(["skill-linear-equations"]);
  });

  it("render: a self-focused or overlong reply is rejected for the deterministic phrasing", async () => {
    const bad = llm(() => "You are just bad at factoring, aren't you?");
    expect(await bad.renderQuestion("For {skill}?", { skill: "factoring" })).toBe(
      "For factoring?",
    );

    const good = llm(() => "What tripped you up on the factoring question?");
    expect(await good.renderQuestion("For {skill}?", { skill: "factoring" })).toBe(
      "What tripped you up on the factoring question?",
    );
  });
});

describe("render validation", () => {
  it("rejects self-focused, empty, overlong, or unreadable questions", () => {
    expect(validateRenderedQuestion("What happened on the slope question?")).toBe(true);
    expect(validateRenderedQuestion("You are bad at this")).toBe(false);
    expect(validateRenderedQuestion("")).toBe(false);
    expect(validateRenderedQuestion("supercalifragilisticexpialidocious extra")).toBe(false);
  });
});
