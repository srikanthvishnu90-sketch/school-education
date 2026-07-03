import { describe, expect, it } from "vitest";

import { LEXICON_VERSION, detectCrisis } from "@/safety";

/**
 * The detector is pure, deterministic, and recall-biased. tier_1 (explicit intent
 * or plan) outranks tier_2 (ideation-adjacent). It routes; it never assesses.
 */
describe("detectCrisis", () => {
  it("tier_1: explicit self-directed intent/plan escalates immediately", () => {
    for (const text of [
      "i want to kill myself",
      "I have a plan to end my life",
      "how do i kill myself",
      "I'm going to hurt myself tonight",
    ]) {
      expect(detectCrisis(text)?.tier).toBe("tier_1");
    }
  });

  it("tier_2: ideation-adjacent language escalates at lower urgency", () => {
    for (const text of [
      "i wish i wasn't here",
      "everyone would be better without me",
      "I feel so hopeless and I can't go on",
    ]) {
      expect(detectCrisis(text)?.tier).toBe("tier_2");
    }
  });

  it("tier_1 outranks tier_2 when both could match", () => {
    expect(
      detectCrisis("i feel hopeless and i want to kill myself")?.tier,
    ).toBe("tier_1");
  });

  it("does not fire on ordinary academic frustration", () => {
    for (const text of [
      "this test killed me, it was so hard",
      "I'm dying to be done with algebra",
      "I bombed the quiz and I'm so mad at myself for rushing",
      "I flipped the slope fraction the wrong way",
    ]) {
      expect(detectCrisis(text)).toBeNull();
    }
  });

  it("is deterministic and records the detector version", () => {
    const a = detectCrisis("i want to kill myself");
    const b = detectCrisis("i want to kill myself");
    expect(a).toEqual(b);
    expect(a?.detectorVersion).toBe(LEXICON_VERSION);
  });
});
