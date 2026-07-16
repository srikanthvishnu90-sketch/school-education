import { describe, it, expect } from "vitest";
import {
  identifyStrugglingConcepts,
  conceptMentioned,
  isStruggleSignal,
  hasStruggleSignal,
  STRUGGLE_TECHNICAL_SIGNALS,
  type ReflectionStruggleInput,
} from "./strugglingConcepts";

function ref(
  studentId: string,
  struggling: boolean,
  answerText: string,
): ReflectionStruggleInput {
  return { studentId, struggling, answerText };
}

describe("isStruggleSignal / hasStruggleSignal", () => {
  it("treats trouble signals as struggle and mastery/process signals as not", () => {
    expect(isStruggleSignal("misunderstood_concept")).toBe(true);
    expect(isStruggleSignal("application_difficulty")).toBe(true);
    expect(isStruggleSignal("understood_concept")).toBe(false);
    expect(isStruggleSignal("careless_error")).toBe(false);
    expect(isStruggleSignal("time_management")).toBe(false);
  });

  it("hasStruggleSignal is true iff any signal is a struggle marker", () => {
    expect(hasStruggleSignal(["understood_concept", "can_explain"])).toBe(false);
    expect(hasStruggleSignal(["understood_concept", "unclear_step"])).toBe(true);
    expect(hasStruggleSignal([])).toBe(false);
  });

  it("every listed struggle signal is recognised", () => {
    for (const s of STRUGGLE_TECHNICAL_SIGNALS) expect(isStruggleSignal(s)).toBe(true);
  });
});

describe("conceptMentioned", () => {
  it("matches case- and punctuation-insensitively", () => {
    expect(conceptMentioned("I was lost on Factoring.", "factoring")).toBe(true);
    expect(conceptMentioned("the middle-term sign tripped me", "middle term")).toBe(true);
  });

  it("does not match a concept the student never named", () => {
    expect(conceptMentioned("It felt rushed and confusing.", "factoring")).toBe(false);
    expect(conceptMentioned("anything", "")).toBe(false);
  });
});

describe("identifyStrugglingConcepts", () => {
  const POOL = ["factoring", "quadratic", "the middle term"];

  it("flags a concept several struggling students named", () => {
    const report = identifyStrugglingConcepts(POOL, [
      ref("s-avery", true, "I didn't get the factoring part at all"),
      ref("s-blake", true, "got lost on factoring the problems"),
      ref("s-casey", false, "factoring made sense to me"),
    ]);
    expect(report.completedCount).toBe(3);
    expect(report.strugglingCount).toBe(2);
    expect(report.concepts).toHaveLength(1);
    expect(report.concepts[0].concept).toBe("factoring");
    expect(report.concepts[0].studentCount).toBe(2);
    expect(report.concepts[0].studentIds).toEqual(["s-avery", "s-blake"]);
  });

  it("does NOT count a student who named the concept but did not struggle", () => {
    const report = identifyStrugglingConcepts(POOL, [
      ref("s-avery", true, "factoring was hard"),
      ref("s-casey", false, "factoring was easy, I got it"),
    ]);
    // Only one struggling mention → below the floor of 2.
    expect(report.concepts).toHaveLength(0);
  });

  it("requires both a floor count AND a fraction of the class", () => {
    // 10 students, only 2 struggling on 'quadratic' → clears floor(2) but not 30%.
    const many: ReflectionStruggleInput[] = [
      ref("a", true, "quadratic confused me"),
      ref("b", true, "quadratic was tough"),
      ...Array.from({ length: 8 }, (_, i) => ref(`ok-${i}`, false, "all clear")),
    ];
    const report = identifyStrugglingConcepts(POOL, many);
    // threshold = max(2, ceil(10 * 0.3)) = 3; only 2 named it → not flagged.
    expect(report.concepts).toHaveLength(0);
  });

  it("ranks concepts by number of struggling students", () => {
    const report = identifyStrugglingConcepts(POOL, [
      ref("a", true, "factoring and quadratic both lost me"),
      ref("b", true, "factoring and quadratic were the hard part"),
      ref("c", true, "factoring, so confusing"),
    ]);
    expect(report.concepts.map((c) => c.concept)).toEqual(["factoring", "quadratic"]);
    expect(report.concepts[0].studentCount).toBe(3);
    expect(report.concepts[1].studentCount).toBe(2);
  });

  it("dedups the concept pool case-insensitively", () => {
    const report = identifyStrugglingConcepts(["Factoring", "factoring", "FACTORING"], [
      ref("a", true, "factoring hard"),
      ref("b", true, "factoring hard"),
    ]);
    expect(report.concepts).toHaveLength(1);
    expect(report.concepts[0].concept).toBe("Factoring");
  });

  it("returns nothing for an empty class", () => {
    const report = identifyStrugglingConcepts(POOL, []);
    expect(report.completedCount).toBe(0);
    expect(report.concepts).toHaveLength(0);
  });

  it("honours the limit", () => {
    const report = identifyStrugglingConcepts(
      ["factoring", "quadratic", "the middle term"],
      [
        ref("a", true, "factoring quadratic the middle term all hard"),
        ref("b", true, "factoring quadratic the middle term all hard"),
      ],
      { limit: 2 },
    );
    expect(report.concepts).toHaveLength(2);
  });
});
