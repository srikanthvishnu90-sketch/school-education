import { describe, expect, it } from "vitest";

import {
  PINNED_MODELS,
  createDeterministicLanguageCapability,
  createFakeGateway,
  createLlmLanguageCapability,
} from "@/adapters/language";
import { shadowCompare } from "@/app/_world/shadowRender";

/**
 * Shadow mode harvests deterministic-vs-LLM renders WITHOUT a real key (fake
 * gateway). The student never sees these; they are the golden-set substrate. A
 * valid LLM phrasing is captured as a disagreement; an invalid one falls back to
 * deterministic and is captured as agreement — exactly what the harness will grade
 * on real data later.
 */

const DEPS = { models: PINNED_MODELS, now: () => new Date("2026-07-03T00:00:00Z") };
const clock = () => new Date("2026-07-03T00:00:00Z");

describe("shadowCompare", () => {
  it("captures a valid LLM phrasing as a disagreement with deterministic", async () => {
    const llm = createLlmLanguageCapability({
      gateway: createFakeGateway(
        () => "What tripped you up on the factoring question?",
        DEPS,
      ),
      fallback: createDeterministicLanguageCapability(),
      config: { tasks: { classify: false, tag: false, render: true } },
    });

    const entries = await shadowCompare(
      llm,
      [{ template: "On {skill}?", slots: { skill: "factoring" } }],
      clock,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].deterministic).toBe("On factoring?");
    expect(entries[0].llm).toBe("What tripped you up on the factoring question?");
    expect(entries[0].agreed).toBe(false);
  });

  it("captures an invalid LLM phrasing as agreement (it falls back to deterministic)", async () => {
    const llm = createLlmLanguageCapability({
      gateway: createFakeGateway(() => "You are bad at factoring", DEPS),
      fallback: createDeterministicLanguageCapability(),
      config: { tasks: { classify: false, tag: false, render: true } },
    });

    const entries = await shadowCompare(
      llm,
      [{ template: "On {skill}?", slots: { skill: "factoring" } }],
      clock,
    );
    expect(entries[0].llm).toBe("On factoring?"); // self-focused → rejected → fallback
    expect(entries[0].agreed).toBe(true);
  });
});
