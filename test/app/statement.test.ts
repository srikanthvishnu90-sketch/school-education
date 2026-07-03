import { describe, expect, it } from "vitest";

import { calibrationStatement } from "@/app/_world/statement";

/**
 * The calibration statement is a product-safety surface (Kluger & DeNisi):
 * feedback about the WORK, never the worth. These tests pin that the copy is
 * task-focused, carries no self-referential vocabulary, and never shouts.
 */

// Words that would turn the feedback toward the SELF (forbidden).
const FORBIDDEN = [
  "bad at",
  "not good",
  "no good",
  "stupid",
  "dumb",
  "smart",
  "talent",
  "gifted",
  "failure",
  "worthless",
  "can't do",
  "you are bad",
  "ability",
  "genius",
];

function assertTaskFocused(text: string): void {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN) {
    expect(lower, `must not contain "${phrase}"`).not.toContain(phrase);
  }
  // Calm, never celebratory or alarming.
  expect(text).not.toContain("!");
}

describe("calibrationStatement — task-focused, never self-focused", () => {
  it("overconfident-low: gap language about the TASK, no self-reference", () => {
    const s = calibrationStatement({ skillName: "interpreting slope", bias: 0.65 });
    expect(s.tone).toBe("gap");
    expect(s.text).toBe(
      "Your confidence and your results were far apart on interpreting slope. " +
        "Here, your confidence ran ahead of the evidence.",
    );
    assertTaskFocused(s.text);
  });

  it("underconfident: still task-focused, 'fell behind' not a self-judgment", () => {
    const s = calibrationStatement({ skillName: "linear equations", bias: -0.6 });
    expect(s.tone).toBe("gap");
    expect(s.text).toContain("fell behind the evidence");
    assertTaskFocused(s.text);
  });

  it("aligned: ink-tint tone, lined-up language", () => {
    const s = calibrationStatement({ skillName: "linear equations", bias: 0.05 });
    expect(s.tone).toBe("aligned");
    expect(s.text).toContain("lined up on linear equations");
    assertTaskFocused(s.text);
  });
});
