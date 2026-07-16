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

  it("sees through common obfuscation (spacing, punctuation, elongation)", () => {
    for (const text of [
      "k i l l myself", // spaced letters
      "killlll myself", // elongation
      "i want to k.i.l.l myself", // punctuation-separated
      "s u i c i d e", // spaced single word
      "s-u-i-c-i-d-e", // dash-separated
      "suicidddde", // elongation on the tail
      "i'm going to o v e r d o s e", // spaced tier_1 token
    ]) {
      expect(detectCrisis(text)?.tier).toBe("tier_1");
    }
    expect(detectCrisis("s e l f h a r m")?.tier).toBe("tier_2");
  });

  it("de-obfuscation does not create false positives on benign spaced text", () => {
    for (const text of [
      "I need to skill myself up for this test", // 'skill myself' must not read as 'kill myself'
      "a b c d e f g", // spaced letters, no crisis token
      "the answer is s o l a r energy", // spaced benign word
      "I will not overdo it this time", // near 'overdose' but not it
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
