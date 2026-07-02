import { describe, expect, it } from "vitest";

import {
  arousalSchema,
  attributionCategorySchema,
  emotionLabelSchema,
  predictionSchema,
  unitIntervalSchema,
  valenceSchema,
} from "@/domain/schemas";
import { createPrediction } from "@/domain/prediction";
import { makePrediction } from "../fixtures/domain";

describe("primitive schemas", () => {
  it("unitInterval accepts [0, 1] and rejects outside / non-finite", () => {
    expect(unitIntervalSchema.safeParse(0).success).toBe(true);
    expect(unitIntervalSchema.safeParse(1).success).toBe(true);
    expect(unitIntervalSchema.safeParse(0.5).success).toBe(true);
    expect(unitIntervalSchema.safeParse(-0.001).success).toBe(false);
    expect(unitIntervalSchema.safeParse(1.001).success).toBe(false);
    expect(unitIntervalSchema.safeParse(Number.NaN).success).toBe(false);
    expect(unitIntervalSchema.safeParse(Infinity).success).toBe(false);
  });

  it("valence accepts [-1, 1], arousal accepts [0, 1]", () => {
    expect(valenceSchema.safeParse(-1).success).toBe(true);
    expect(valenceSchema.safeParse(1).success).toBe(true);
    expect(valenceSchema.safeParse(-1.1).success).toBe(false);
    expect(arousalSchema.safeParse(0).success).toBe(true);
    expect(arousalSchema.safeParse(1).success).toBe(true);
    expect(arousalSchema.safeParse(-0.1).success).toBe(false);
  });
});

describe("structural schemas", () => {
  it("attribution category is limited to the five sanctioned causes", () => {
    for (const c of [
      "strategy",
      "effort_allocation",
      "misconception",
      "external",
      "ability",
    ]) {
      expect(attributionCategorySchema.safeParse(c).success).toBe(true);
    }
    expect(attributionCategorySchema.safeParse("laziness").success).toBe(false);
  });

  it("emotionLabel requires a non-empty term and in-range coordinates", () => {
    expect(
      emotionLabelSchema.safeParse({ term: "", valence: 0, arousal: 0.5 })
        .success,
    ).toBe(false);
    expect(
      emotionLabelSchema.safeParse({ term: "tense", valence: 0, arousal: 0.5 })
        .success,
    ).toBe(true);
  });

  it("prediction schema accepts a valid prediction and rejects a bad confidence", () => {
    expect(predictionSchema.safeParse(makePrediction()).success).toBe(true);
    expect(
      predictionSchema.safeParse(
        makePrediction({ itemPredictions: [{ itemId: "i", confidence: 2 }] }),
      ).success,
    ).toBe(false);
  });
});

describe("factories return frozen (immutable) entities", () => {
  it("freezes the produced object", () => {
    const prediction = createPrediction(makePrediction());
    expect(Object.isFrozen(prediction)).toBe(true);
  });
});
