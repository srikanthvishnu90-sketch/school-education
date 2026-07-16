import { describe, it, expect } from "vitest";
import {
  detectExternalFactors,
  externalFactorLabels,
  EXTERNAL_FACTOR_DETECTOR_VERSION,
  type ExternalFactorCategory,
} from "./externalFactors";

function cats(text: string): ExternalFactorCategory[] {
  return detectExternalFactors(text)?.categories ?? [];
}

describe("detectExternalFactors — real outside-school pressure", () => {
  const cases: [string, ExternalFactorCategory][] = [
    ["I was up all night and couldn't sleep, so I was exhausted.", "sleep"],
    ["There's a lot of stuff going on at home right now.", "home_family"],
    ["My parents are fighting and it's hard to focus.", "home_family"],
    ["I was taking care of my little brother all evening.", "caregiving"],
    ["I had to work a late shift after school.", "work_job"],
    ["We couldn't afford the calculator and I was hungry.", "basic_needs"],
    ["I was really sick and had a doctor's appointment.", "health"],
    ["My grandma passed away last week.", "loss"],
    ["Practice ran late and there's just too much going on.", "overwhelmed"],
  ];
  for (const [text, expected] of cases) {
    it(`flags ${expected} in: "${text}"`, () => {
      expect(cats(text)).toContain(expected);
    });
  }

  it("can surface more than one factor at once", () => {
    const c = cats("I was up all night helping out at home, so tired.");
    expect(c).toContain("sleep");
    expect(c).toContain("caregiving");
  });

  it("stamps the detector version", () => {
    const hit = detectExternalFactors("there is stuff going on at home");
    expect(hit?.detectorVersion).toBe(EXTERNAL_FACTOR_DETECTOR_VERSION);
  });
});

describe("detectExternalFactors — ordinary school talk does NOT flag", () => {
  const benign = [
    "I did my homework at home and it made sense.",
    "The factoring was hard but I think I got it.",
    "This test was tough, I felt rushed at the end.",
    "I was confused about the middle term.",
    "I worked through the problems and checked my answers.",
    "Group work was fun today.",
  ];
  for (const text of benign) {
    it(`no flag: "${text}"`, () => {
      expect(detectExternalFactors(text)).toBeNull();
    });
  }
});

describe("externalFactorLabels", () => {
  it("maps categories to gentle, non-diagnostic phrases in canonical order", () => {
    const labels = externalFactorLabels(["sleep", "home_family"]);
    expect(labels).toEqual([
      "something going on at home",
      "not sleeping enough / exhaustion",
    ]);
  });

  it("dedupes repeated categories", () => {
    expect(externalFactorLabels(["sleep", "sleep"])).toEqual([
      "not sleeping enough / exhaustion",
    ]);
  });
});
