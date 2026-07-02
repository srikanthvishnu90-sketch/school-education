import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/common";
import {
  MIN_DISTINCT_AFFECT_DISTANCE,
  createAffectSnapshot,
  createEmotionLabel,
  granularity,
  type EmotionLabel,
} from "@/domain/emotion";
import { makeAffectSnapshot } from "../fixtures/domain";

describe("emotion label ranges", () => {
  it("accepts valence in [-1, 1] and arousal in [0, 1] at the boundaries", () => {
    expect(() =>
      createEmotionLabel({ term: "dread", valence: -1, arousal: 1 }),
    ).not.toThrow();
    expect(() =>
      createEmotionLabel({ term: "serene", valence: 1, arousal: 0 }),
    ).not.toThrow();
  });

  it("rejects valence outside [-1, 1]", () => {
    expect(() =>
      createEmotionLabel({ term: "x", valence: -1.1, arousal: 0.5 }),
    ).toThrow();
    expect(() =>
      createEmotionLabel({ term: "x", valence: 1.1, arousal: 0.5 }),
    ).toThrow();
  });

  it("rejects arousal outside [0, 1]", () => {
    expect(() =>
      createEmotionLabel({ term: "x", valence: 0, arousal: -0.1 }),
    ).toThrow();
    expect(() =>
      createEmotionLabel({ term: "x", valence: 0, arousal: 1.1 }),
    ).toThrow();
  });
});

describe("affect snapshot invariants", () => {
  it("accepts a post_evidence snapshot with at least one label", () => {
    expect(() => createAffectSnapshot(makeAffectSnapshot())).not.toThrow();
  });

  it("rejects a snapshot that names zero states", () => {
    expect(() =>
      createAffectSnapshot(makeAffectSnapshot({ labels: [] })),
    ).toThrow(DomainError);
  });

  it("rejects a label with an out-of-range coordinate inside the snapshot", () => {
    expect(() =>
      createAffectSnapshot(
        makeAffectSnapshot({
          labels: [{ term: "x", valence: 2, arousal: 0.5 }],
        }),
      ),
    ).toThrow();
  });
});

describe("granularity() — Barrett emotional differentiation", () => {
  const goodBadOnly: EmotionLabel[] = [
    { term: "good", valence: 0.6, arousal: 0.5 },
    { term: "bad", valence: -0.6, arousal: 0.5 },
  ];

  const differentiated: EmotionLabel[] = [
    { term: "anxious", valence: -0.6, arousal: 0.85 },
    { term: "discouraged", valence: -0.5, arousal: 0.2 },
    { term: "hopeful", valence: 0.5, arousal: 0.6 },
    { term: "relieved", valence: 0.4, arousal: 0.15 },
  ];

  it("scores an empty set as 0 and a single label as 1", () => {
    expect(granularity([])).toBe(0);
    expect(granularity([{ term: "good", valence: 0.6, arousal: 0.5 }])).toBe(1);
  });

  it("scores a good/bad-only snapshot LOWER than a differentiated one", () => {
    expect(granularity(goodBadOnly)).toBeLessThan(granularity(differentiated));
    expect(granularity(differentiated)).toBe(4);
  });

  it("collapses synonyms sitting at nearly the same (valence, arousal)", () => {
    const synonyms: EmotionLabel[] = [
      { term: "happy", valence: 0.6, arousal: 0.5 },
      { term: "glad", valence: 0.61, arousal: 0.51 },
      { term: "pleased", valence: 0.59, arousal: 0.49 },
    ];
    // All within MIN_DISTINCT_AFFECT_DISTANCE ⇒ one differentiated state, not three.
    expect(granularity(synonyms)).toBe(1);
  });

  it("counts two states as distinct exactly when they clear the distance threshold", () => {
    const base: EmotionLabel = { term: "a", valence: 0, arousal: 0 };
    const justUnder: EmotionLabel = {
      term: "b",
      valence: MIN_DISTINCT_AFFECT_DISTANCE - 0.05,
      arousal: 0,
    };
    const justOver: EmotionLabel = {
      term: "c",
      valence: MIN_DISTINCT_AFFECT_DISTANCE + 0.05,
      arousal: 0,
    };
    expect(granularity([base, justUnder])).toBe(1);
    expect(granularity([base, justOver])).toBe(2);
  });
});
