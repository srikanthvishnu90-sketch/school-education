import { describe, expect, it } from "vitest";

import {
  PPRA_LEXICON_VERSION,
  PpraCategory,
  probesProtectedTopic,
  screenForPpra,
} from "@/domain/intelligence/ppraGuard";

/**
 * The PPRA guard makes 20 U.S.C. § 1232h executable: a student-facing question
 * that probes one of the eight federally protected survey areas must be flagged
 * before it ships. This suite proves two things:
 *  (a) each protected category is hit by a representative, independently authored
 *      probe (a paraphrase, not a copy of a lexicon pattern), mapped to the RIGHT
 *      category; and
 *  (b) ordinary lesson-reflection questions — the kind plumb actually asks — do
 *      NOT trip the guard.
 */

// --- (a) positives: one representative probe per protected category ----------

const PROBES: readonly [PpraCategory, string][] = [
  [
    PpraCategory.PoliticalAffiliations,
    "Who do your parents vote for in elections?",
  ],
  [
    PpraCategory.PoliticalAffiliations,
    "Are you a Democrat or a Republican?",
  ],
  [
    PpraCategory.MentalHealth,
    "Have you ever been diagnosed with depression?",
  ],
  [
    PpraCategory.MentalHealth,
    "Have you ever seen a therapist about your feelings?",
  ],
  [
    PpraCategory.SexBehaviorAttitudes,
    "Have you ever had sex?",
  ],
  [
    PpraCategory.SexBehaviorAttitudes,
    "What is your sexual orientation?",
  ],
  [
    PpraCategory.IllegalAntisocialSelfIncriminating,
    "Does anyone in your home drink alcohol or use drugs?",
  ],
  [
    PpraCategory.IllegalAntisocialSelfIncriminating,
    "Have you ever tried marijuana?",
  ],
  [
    PpraCategory.CriticalAppraisalsOfFamily,
    "What do you dislike about your mother?",
  ],
  [
    PpraCategory.PrivilegedRelationships,
    "What did your family's lawyer tell you about the case?",
  ],
  [
    PpraCategory.ReligiousPracticesBeliefs,
    "What religion is your family?",
  ],
  [
    PpraCategory.ReligiousPracticesBeliefs,
    "How often do you attend church?",
  ],
  [
    PpraCategory.Income,
    "What is your family's income?",
  ],
  [
    PpraCategory.Income,
    "How much money do your parents make?",
  ],
];

// --- (b) negatives: ordinary lesson-reflection questions (must be allowed) ----
// These deliberately brush against the surface words (drink/alcohol in chemistry,
// religion in a history lesson, "parents" in a reflection) that a naive guard
// would over-match.

const CLEAN: readonly string[] = [
  "How confident were you solving the quadratic equation today?",
  "What step in the long-division problem felt hardest?",
  "In your own words, explain how you balanced the chemical equation.",
  "Before you see your score, how much of the worksheet do you think you got right?",
  "What did you do when the word problem got tricky?",
  "Explain the causes that led to the start of the Civil War.",
  "How does temperature affect how fast alcohol evaporates in the lab?",
  "Compare the major world religions covered in this unit's reading.",
  "How did the political parties differ during the Reconstruction era?",
  "What was the income effect described in the economics chapter?",
  "Describe how the family in the novel changes over the three acts.",
  "Which vote in Congress passed the bill you read about?",
];

describe("ppraGuard — unit", () => {
  it("exposes a stable, semver lexicon version", () => {
    expect(PPRA_LEXICON_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("models exactly the eight federally protected areas", () => {
    expect(new Set(Object.values(PpraCategory)).size).toBe(8);
    expect(Object.values(PpraCategory)).toEqual([
      "political_affiliations",
      "mental_health",
      "sex_behavior_attitudes",
      "illegal_antisocial_self_incriminating",
      "critical_appraisals_of_family",
      "privileged_relationships",
      "religious_practices_beliefs",
      "income",
    ]);
  });

  it.each(PROBES)(
    "flags a %s probe and maps it to that category",
    (category, text) => {
      const result = screenForPpra(text);
      expect(result.hit, `expected a hit for: ${text}`).toBe(true);
      expect(result.categories, text).toContain(category);
      expect(probesProtectedTopic(text)).toBe(true);
    },
  );

  it.each(CLEAN)("allows ordinary lesson-reflection question: %j", (text) => {
    const result = screenForPpra(text);
    expect(result.hit, `unexpected PPRA hit for: ${text}`).toBe(false);
    expect(result.categories).toEqual([]);
    expect(probesProtectedTopic(text)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(probesProtectedTopic("WHAT RELIGION IS YOUR FAMILY?")).toBe(true);
    expect(probesProtectedTopic("what is your family's income")).toBe(true);
  });

  it("returns distinct categories without duplicates", () => {
    const result = screenForPpra(
      "What religion is your family, and how often do you attend church?",
    );
    expect(result.categories).toEqual([
      PpraCategory.ReligiousPracticesBeliefs,
    ]);
  });

  it("collects multiple distinct categories when several are probed", () => {
    const result = screenForPpra(
      "What is your family's income, and what religion is your family?",
    );
    expect(result.categories).toContain(PpraCategory.Income);
    expect(result.categories).toContain(
      PpraCategory.ReligiousPracticesBeliefs,
    );
  });
});
