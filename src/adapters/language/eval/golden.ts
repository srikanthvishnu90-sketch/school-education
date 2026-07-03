import type { AttributionCategory } from "@/domain/reflection";
import type { SkillRef } from "@/domain/ports";

/**
 * Golden sets — the labelled fixtures the eval harness scores every capability
 * against. These are the CONTRACT: a candidate (the model) earns each task only
 * by beating the deterministic baseline on these, by a margin. They are checked
 * into the repo and versioned so a regression is a diff, not a surprise.
 *
 * NO cheating (CLAUDE.md build standard): labels are the honest ground truth, the
 * same fixtures score baseline and candidate, and the harness never sees them at
 * "inference" time — it only compares the returned label to the held label here.
 */

export interface AttributionCase {
  text: string;
  label: AttributionCategory;
}

export interface SkillCase {
  text: string;
  /** The subset of SKILLS the passage is genuinely about. */
  expected: readonly string[];
}

export interface RenderCase {
  template: string;
  slots: Readonly<Record<string, string>>;
  /** Every slot value must survive into the rendered question (no information dropped). */
  mustContain: readonly string[];
}

export const SKILLS: readonly SkillRef[] = [
  { id: "skill-linear-equations", name: "linear equations" },
  { id: "skill-interpreting-slope", name: "interpreting slope" },
  { id: "skill-factoring", name: "factoring" },
  { id: "skill-fractions", name: "fractions" },
];

// Build the attribution golden set from labelled phrasings per category, several
// surface forms each, so the set exercises real variation rather than one string.
const ATTRIBUTION_SEED: Readonly<Record<AttributionCategory, readonly string[]>> = {
  strategy: [
    "I did not show my work so I could not check the steps",
    "my approach was wrong, I should have drawn it out first",
    "I need a better method for setting these up",
    "I guessed instead of writing out a plan for the problem",
    "next time I will double check each step before moving on",
    "my steps were out of order so the answer came out wrong",
  ],
  effort_allocation: [
    "I rushed the last few and ran out of time",
    "I did not give this enough time to think it through",
    "I skipped studying this part the night before",
    "I spent too long on question one and had no time left",
    "I was tired and did not put in the effort",
    "I left the hard ones for last and never got to them",
  ],
  misconception: [
    "I mixed up the sign when I moved it across",
    "I thought the rule meant something it did not",
    "I misremembered the formula for the slope",
    "I confused the two different steps in my head",
    "I had the wrong idea about what the question asked",
    "I used the wrong formula because I remembered it wrong",
  ],
  external: [
    "the room was too noisy for me to focus",
    "my calculator died in the middle of the test",
    "I was sick that whole week and missed the lesson",
    "the test felt unfair on that section",
    "someone kept distracting me during the quiz",
    "the teacher had not covered this one yet",
  ],
  ability: [
    "I am just bad at math and always will be",
    "I am not smart enough for this",
    "I can never understand any of this stuff",
    "I am just dumb at these problems",
    "I am terrible at math, that is all it is",
    "I never get this no matter what I do",
  ],
};

export const ATTRIBUTION_GOLDEN: readonly AttributionCase[] = Object.entries(
  ATTRIBUTION_SEED,
).flatMap(([label, texts]) =>
  texts.map((text) => ({ text, label: label as AttributionCategory })),
);

export const SKILL_GOLDEN: readonly SkillCase[] = [
  { text: "I struggled with the linear equations questions", expected: ["skill-linear-equations"] },
  { text: "interpreting slope from a graph was hard", expected: ["skill-interpreting-slope"] },
  { text: "the factoring ones threw me off", expected: ["skill-factoring"] },
  { text: "I still don't get fractions", expected: ["skill-fractions"] },
  {
    text: "both the linear equations and interpreting slope items were confusing",
    expected: ["skill-linear-equations", "skill-interpreting-slope"],
  },
  { text: "I felt fine about all of it", expected: [] },
  { text: "factoring and fractions both tripped me up", expected: ["skill-factoring", "skill-fractions"] },
  { text: "the slope question in context was the tricky one", expected: ["skill-interpreting-slope"] },
  { text: "solving for x in the equations went badly", expected: ["skill-linear-equations"] },
  { text: "nothing in particular stood out", expected: [] },
];

export const RENDER_GOLDEN: readonly RenderCase[] = [
  {
    template: "On the {skill} question — {prompt} — what happened when you worked it?",
    slots: { skill: "linear equations", prompt: "Solve 3x + 5 = 20" },
    mustContain: ["linear equations"],
  },
  {
    template: "Walk me through {prompt}. Where did the {skill} step go a different way than you expected?",
    slots: { skill: "interpreting slope", prompt: "Find the slope through (1, 2) and (3, 8)" },
    mustContain: ["slope"],
  },
  {
    template: "You got {prompt} wrong. What did you believe was true that turned out not to be?",
    slots: { prompt: "Solve 2(x - 4) = 10" },
    mustContain: ["Solve 2"],
  },
  {
    template: "For {skill}, what is one small thing you will do differently next time?",
    slots: { skill: "factoring" },
    mustContain: ["factoring"],
  },
  {
    template: "Looking back at {prompt}, what was the very first place it went sideways?",
    slots: { prompt: "the fractions problem" },
    mustContain: ["fractions"],
  },
];
