
/**
 * Research-grounded rules for FORMULATING student reflection questions, focused on
 * high schoolers (plumb's audience, ages ~14–18). Kids don't always self-report
 * truthfully: they agree to be nice (acquiescence / yea-saying), answer questions
 * they can't really know instead of saying "I don't know" (Waterman, Blades &
 * Spencer), and say what looks good (social desirability). Teens additionally
 * manage what they show behind a felt "imaginary audience" (Elkind) and want to be
 * their own boss (autonomy — Self-Determination Theory, Deci & Ryan).
 *
 * So this module encodes what the research says makes a question honest and
 * answerable, and flags the anti-patterns. It is pure and deterministic — a
 * guardrail over generated questions, never a model. Full write-up with citations:
 * docs/question-design.md.
 */

export interface DesignPrinciple {
  id: string;
  /** Plain-language rule, teacher-facing. */
  rule: string;
  /** The research reason it matters. */
  because: string;
  /** Short citation anchor to look up. */
  cite: string;
}

export const QUESTION_DESIGN_PRINCIPLES: readonly DesignPrinciple[] = [
  {
    id: "episodic",
    rule: "Ask about a real, recent moment — not a fixed trait.",
    because:
      "Teens recall concrete events better than they can judge their whole self; a “today/this week” anchor gets truer answers.",
    cite: "episodic + time anchoring",
  },
  {
    id: "feeling-menu",
    rule: "Offer a menu of specific feeling words, not just good vs. bad.",
    because:
      "Emotional granularity actually dips in the early teens (~13–15); more words → more exact, truer feelings.",
    cite: "Barrett; Nook et al.",
  },
  {
    id: "no-leading",
    rule: "Never hint at the “right” answer inside the question.",
    because: "Teens follow hidden hints (suggestibility).",
    cite: "Ceci & Bruck",
  },
  {
    id: "no-yes-no-skill",
    rule: "Don’t judge skill with yes/no or agree/disagree.",
    because:
      "Unsure kids lean toward “yes” (acquiescence); use a scale, or predict-then-check.",
    cite: "acquiescence / yea-saying",
  },
  {
    id: "one-idea",
    rule: "One idea per question — never two joined by “and”.",
    because: "Double-barreled items can’t be answered honestly.",
    cite: "double-barreled",
  },
  {
    id: "short",
    rule: "Keep it short — a handful of questions.",
    because:
      "Long surveys cause fatigue, satisficing, and straight-lining (~25% of students by a survey’s end).",
    cite: "Krosnick; Educational Researcher 2021",
  },
  {
    id: "skippable",
    rule: "Let students skip or say “I don’t know”.",
    because:
      "Otherwise kids invent answers to questions they can’t know; choice (autonomy) raises honesty.",
    cite: "Waterman; SDT (Deci & Ryan)",
  },
  {
    id: "privacy",
    rule: "Say plainly who sees the answer, and that it won’t be punished.",
    because: "Belief in privacy is the single biggest lever for honest answers.",
    cite: "Turner 1998; Ong & Weiss 2000; Soneson 2025",
  },
  {
    id: "feed-forward",
    rule: "End with a next step, and point at causes the student can change.",
    because:
      "Naming a problem with no help can make a few kids feel worse; effort/strategy attributions help.",
    cite: "Hattie & Timperley; Weiner; iatrogenic-harm guard",
  },
  {
    id: "predict-then-check",
    rule: "Prefer “predict, then see the result” over “rate yourself”.",
    because:
      "Bare self-ratings reflect hope; the gap between a prediction and the real outcome teaches real calibration.",
    cite: "Zimmerman forethought; calibration",
  },
];

/** Response-format guidance by age band. High school is plumb's default band. */
export interface AgeBand {
  band: string;
  ages: string;
  /** Most scale points the band can reliably use. */
  maxScalePoints: number;
  formats: string;
}

export const AGE_BAND_FORMATS: readonly AgeBand[] = [
  { band: "Early elementary", ages: "6–7", maxScalePoints: 2, formats: "2 faces / yes-no; read aloud; one idea" },
  { band: "Elementary", ages: "8–10", maxScalePoints: 3, formats: "3-point faces or words; easy “I don’t know”" },
  { band: "Middle school", ages: "11–14", maxScalePoints: 5, formats: "3-point reliably, 5-point if tested; word labels" },
  { band: "High school", ages: "14–18", maxScalePoints: 5, formats: "up to 5-point Likert; feeling menus; optional open text; strong privacy" },
];

/** The high-school defaults plumb builds to. */
export const HIGH_SCHOOL_BAND: AgeBand = AGE_BAND_FORMATS[AGE_BAND_FORMATS.length - 1];

export type DesignIssue =
  | "leading"
  | "double_barreled"
  | "abstract_trait"
  | "yes_no"
  | "too_long";

export interface QuestionReview {
  issues: DesignIssue[];
  ok: boolean;
}

/** Longest a single prompt should run before it taxes attention/reading. */
export const MAX_QUESTION_CHARS = 160;

// Hints that steer a student toward an answer. The ", right?" tag must be
// comma-led so ordinary "…were right?" (meaning correct) doesn't trip it.
const LEADING =
  /\b(isn'?t it|don'?t you think|wouldn'?t you agree|obviously|clearly|surely)\b|,\s*right\s*\?/i;
// A fixed, global self-label rather than a concrete moment.
const ABSTRACT_TRAIT =
  /\bare you (a |an )?(good|bad|smart|dumb|lazy|great|hard[- ]?work(er|ing))\b|\bare you good at\b|\bhow good are you at\b|\bare you always\b|\bwhat are you like\b/i;
// Two separate asks joined by "and" in a single (usually yes/no) question.
const DOUBLE_BARRELED =
  /\b(do|did|are|were|can|will|would|is|does)\s+you\b[^?]*\band\b[^?]*\?/i;
// An explicit yes/no framing (acquiescence-prone) offered for a judgment.
const YES_NO = /\byes\s*(\/|or)\s*no\b|\(\s*yes\s*\/\s*no\s*\)/i;

/**
 * Review one question against the research rules and return any anti-patterns it
 * trips. `ok` means it's clear to ask. The checks are text-based and therefore
 * format-independent.
 */
export function reviewQuestion(text: string): QuestionReview {
  const t = text.trim();
  const issues: DesignIssue[] = [];
  if (LEADING.test(t)) issues.push("leading");
  if (DOUBLE_BARRELED.test(t)) issues.push("double_barreled");
  if (ABSTRACT_TRAIT.test(t)) issues.push("abstract_trait");
  if (YES_NO.test(t)) issues.push("yes_no");
  if (t.length > MAX_QUESTION_CHARS) issues.push("too_long");
  return { issues, ok: issues.length === 0 };
}

/** Human-readable explanation for each issue (for a warning surface). */
export const ISSUE_EXPLANATIONS: Record<DesignIssue, string> = {
  leading: "Hints at the “right” answer — teens follow the hint (suggestibility).",
  double_barreled: "Asks two things at once — can’t be answered honestly.",
  abstract_trait: "Asks about a fixed trait — ask about a concrete recent moment instead.",
  yes_no: "Yes/no invites agreement bias — use a scale or predict-then-check.",
  too_long: "Too long — trims attention and invites satisficing.",
};
