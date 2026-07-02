import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/common";
import { createLearningGoal } from "@/domain/goal";
import { createPrediction } from "@/domain/prediction";
import { assertPredictionPrecedesOutcome } from "@/domain/prediction";
import { createOutcome } from "@/domain/outcome";
import { createReflection, isProductiveAttribution } from "@/domain/reflection";
import {
  T_PREDICT,
  T_SCORE,
  makeGoal,
  makeOutcome,
  makePrediction,
  makeReflection,
  productiveAttribution,
} from "../fixtures/domain";

describe("range invariants — unit interval [0, 1]", () => {
  it("accepts a target/confidence/globalPredicted at the boundaries", () => {
    expect(() =>
      createLearningGoal(makeGoal({ targetScore: 0 })),
    ).not.toThrow();
    expect(() =>
      createLearningGoal(makeGoal({ targetScore: 1 })),
    ).not.toThrow();
    expect(() =>
      createPrediction(makePrediction({ globalPredicted: 0 })),
    ).not.toThrow();
    expect(() =>
      createPrediction(
        makePrediction({ itemPredictions: [{ itemId: "i", confidence: 1 }] }),
      ),
    ).not.toThrow();
  });

  it("rejects targetScore outside [0, 1]", () => {
    expect(() => createLearningGoal(makeGoal({ targetScore: 1.01 }))).toThrow();
    expect(() =>
      createLearningGoal(makeGoal({ targetScore: -0.01 })),
    ).toThrow();
  });

  it("rejects globalPredicted outside [0, 1]", () => {
    expect(() =>
      createPrediction(makePrediction({ globalPredicted: 1.5 })),
    ).toThrow();
    expect(() =>
      createPrediction(makePrediction({ globalPredicted: -0.2 })),
    ).toThrow();
  });

  it("rejects an item confidence outside [0, 1]", () => {
    expect(() =>
      createPrediction(
        makePrediction({ itemPredictions: [{ itemId: "i", confidence: 1.2 }] }),
      ),
    ).toThrow();
  });

  it("rejects a negative pointsAwarded", () => {
    expect(() =>
      createOutcome(
        makeOutcome({
          itemOutcomes: [{ itemId: "i", correct: true, pointsAwarded: -1 }],
        }),
      ),
    ).toThrow();
  });
});

describe("assertPredictionPrecedesOutcome", () => {
  it("passes when the prediction was created strictly before the outcome", () => {
    expect(() =>
      assertPredictionPrecedesOutcome(makePrediction(), makeOutcome()),
    ).not.toThrow();
  });

  it("throws when the prediction is at or after the outcome (no hindsight)", () => {
    const late = makePrediction({ createdAt: T_SCORE });
    expect(() => assertPredictionPrecedesOutcome(late, makeOutcome())).toThrow(
      DomainError,
    );

    const after = makePrediction({
      createdAt: new Date(T_SCORE.getTime() + 1),
    });
    expect(() => assertPredictionPrecedesOutcome(after, makeOutcome())).toThrow(
      DomainError,
    );
  });

  it("uses the real fixture ordering (predict at T_PREDICT, score at T_SCORE)", () => {
    expect(T_PREDICT.getTime()).toBeLessThan(T_SCORE.getTime());
  });
});

describe("isProductiveAttribution + reflection factory", () => {
  it("is productive iff specific AND controllable", () => {
    expect(isProductiveAttribution(productiveAttribution)).toBe(true);
    expect(
      isProductiveAttribution({ ...productiveAttribution, specific: false }),
    ).toBe(false);
    expect(
      isProductiveAttribution({
        ...productiveAttribution,
        controllable: false,
      }),
    ).toBe(false);
  });

  it("builds a reflection on a productive attribution", () => {
    expect(() => createReflection(makeReflection())).not.toThrow();
  });

  it("rejects a reflection on a stable/global (unproductive) attribution", () => {
    const global = makeReflection({
      attribution: {
        category: "ability",
        specific: false,
        controllable: false,
        note: "I'm just bad at math.",
      },
    });
    expect(() => createReflection(global)).toThrow(DomainError);
  });
});
