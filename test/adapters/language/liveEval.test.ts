import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_GOLDEN,
  PINNED_MODELS,
  REALISTIC_ATTRIBUTION,
  createDeterministicLanguageCapability,
  createHttpGateway,
  createLlmLanguageCapability,
  type AttributionCase,
} from "@/adapters/language";

/**
 * LIVE eval (gated on ANTHROPIC_API_KEY) — the honest measurement the harness
 * needs: deterministic-vs-LLM classify accuracy on the CLEAN golden set and the
 * REALISTIC held-out set. Real numbers, no fitting: the realistic set is never a
 * few-shot exemplar. Skipped in normal runs (no key = no network).
 */
const KEY = process.env.ANTHROPIC_API_KEY;
const suite = KEY ? describe : describe.skip;

suite("classifyAttribution — deterministic vs LLM (live)", () => {
  const det = createDeterministicLanguageCapability();
  const gateway = createHttpGateway({
    apiKey: KEY as string,
    models: PINNED_MODELS,
    now: () => new Date(),
    timeoutMs: 15_000,
  });
  const llm = createLlmLanguageCapability({
    gateway,
    fallback: det,
    config: { tasks: { classify: true, tag: false, render: false } },
  });

  async function accuracy(set: readonly AttributionCase[]) {
    let d = 0;
    let l = 0;
    for (const c of set) {
      if (det.classifyAttribution(c.text) === c.label) d += 1;
      if ((await llm.classifyAttribution(c.text)) === c.label) l += 1;
    }
    return { det: d / set.length, llm: l / set.length, n: set.length };
  }

  it("reports both accuracies and shows the LLM wins on realistic language", async () => {
    const clean = await accuracy(ATTRIBUTION_GOLDEN);
    const real = await accuracy(REALISTIC_ATTRIBUTION);
    console.log(
      `\nclassify accuracy` +
        `\n  clean golden (n=${clean.n}):     deterministic ${(clean.det * 100).toFixed(0)}%   LLM ${(clean.llm * 100).toFixed(0)}%` +
        `\n  REALISTIC held-out (n=${real.n}): deterministic ${(real.det * 100).toFixed(0)}%   LLM ${(real.llm * 100).toFixed(0)}%\n`,
    );
    // The hypothesis: the LLM's edge is on MESSY language a regex can't cover.
    expect(real.llm).toBeGreaterThan(real.det);
  }, 120_000);
});
