import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/common";
import { createLearningGoal } from "@/domain/goal";
import { createOutcome } from "@/domain/outcome";
import { createReflection, isProductiveAttribution } from "@/domain/reflection";
import {
  makeGoal,
  makeOutcome,
  makeReflection,
  productiveAttribution,
} from "../fixtures/domain";

describe("range invariants — unit interval [0, 1]", () => {
  it("accepts a target at the boundaries", () => {
    expect(() => createLearningGoal(makeGoal({ targetScore: 0 }))).not.toThrow();
    expect(() => createLearningGoal(makeGoal({ targetScore: 1 }))).not.toThrow();
  });

  it("rejects targetScore outside [0, 1]", () => {
    expect(() => createLearningGoal(makeGoal({ targetScore: 1.01 }))).toThrow();
    expect(() => createLearningGoal(makeGoal({ targetScore: -0.01 }))).toThrow();
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
