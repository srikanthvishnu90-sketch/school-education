/**
 * Reflection probes — the detailed, free-response questions a student answers
 * during self-reflection, FORMULATED from the teacher's own exam items.
 *
 * plumb is an emotional and academic AWARENESS instrument, not a prediction toy:
 * reflection is where a learner reconstructs their own thinking. So a probe is
 * never "did you get it right" — it asks, item by item, what actually happened and
 * where the reasoning first diverged. The teacher imports the exam's questions;
 * this module turns each one the student missed into a specific, dated line of
 * inquiry that walks their whole academic path through the work.
 *
 * Two design rules from CLAUDE.md are load-bearing here:
 *  - The domain DECIDES which questions to ask (pure code below). The language
 *    layer only PHRASES them — `render` is injected `LanguageCapability.renderQuestion`
 *    (deterministic slot-fill by default; a model may make it read more naturally).
 *    Question SELECTION never depends on a model.
 *  - Feedback is task-focused: every template talks about the work and the steps,
 *    never the student as a person.
 */

import type { Reflection } from "./reflection";

/** How the render slots are phrased into a question. `render` fills the slots. */
export type ReflectionRender = (
  template: string,
  slots: Readonly<Record<string, string>>,
) => string;

export type ProbeKind =
  | "follow_through"
  | "what_happened"
  | "why_wrong"
  | "synthesis";

/**
 * The only attribution categories we ever REFLECT BACK to a student as a
 * recurring pattern. They are controllable and specific, so naming the pattern
 * points at something the student can change. We deliberately never surface
 * "ability" or "external" as a pattern: echoing "you keep saying you're not a
 * math person" would consolidate exactly the stable/global attribution the
 * product exists to dissolve (Weiner; CLAUDE.md safety rules).
 */
export type RecurringCause = "strategy" | "effort_allocation" | "misconception";

const RECURRING_CAUSES: readonly RecurringCause[] = [
  "strategy",
  "effort_allocation",
  "misconception",
];

/**
 * A student's PRIOR data, distilled to what personalizes this cycle's questions.
 * Everything here is derived by pure domain code from stored reflections — the
 * language layer only PHRASES the result; it never decides what is personal.
 */
export interface PriorContext {
  /** The concrete next action they committed to last time (for loop closure). */
  lastAction: string | null;
  /** A controllable cause named in >= 2 prior reflections, if a pattern exists. */
  recurringCause: RecurringCause | null;
  /** How many prior reflections informed this context (for honest framing). */
  priorCycles: number;
}

export const EMPTY_PRIOR_CONTEXT: PriorContext = {
  lastAction: null,
  recurringCause: null,
  priorCycles: 0,
};

/**
 * Distill a student's prior reflections into the personalization context. Pure:
 * the SAME history always yields the SAME context, and no model is consulted.
 *
 * - lastAction: the most recent committed action, so we can close the loop by
 *   asking how it actually went before looking at the new work.
 * - recurringCause: the controllable cause the student themselves has named at
 *   least twice, so reflection can point at their own established pattern. Only
 *   controllable causes qualify (see RecurringCause) — never "ability".
 */
export function derivePriorContext(
  reflections: readonly Reflection[],
): PriorContext {
  if (reflections.length === 0) return EMPTY_PRIOR_CONTEXT;

  const byRecency = [...reflections].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  // Strip trailing sentence punctuation: the action is embedded mid-sentence in
  // the follow-through template, which supplies its own period.
  const lastAction =
    byRecency[0]?.nextAction.text.trim().replace(/[.!?\s]+$/, "") || null;

  // Count only controllable causes; the most frequent that clears 2 wins, ties
  // broken toward the more RECENT occurrence (scan newest-first).
  const counts = new Map<RecurringCause, number>();
  for (const r of byRecency) {
    const c = r.attribution.category;
    if ((RECURRING_CAUSES as readonly string[]).includes(c)) {
      counts.set(c as RecurringCause, (counts.get(c as RecurringCause) ?? 0) + 1);
    }
  }
  let recurringCause: RecurringCause | null = null;
  let best = 1; // require strictly more than one occurrence
  for (const [cause, n] of counts) {
    if (n > best) {
      best = n;
      recurringCause = cause;
    }
  }

  return { lastAction, recurringCause, priorCycles: reflections.length };
}

// Task-focused phrasing of a recurring cause — always about the WORK or the
// approach, never the student as a person.
const RECURRING_PHRASE: Readonly<Record<RecurringCause, string>> = {
  strategy: "how you set your work up",
  effort_allocation: "how you spent your time",
  misconception: "an idea you had backwards",
};

export interface WrongItem {
  /** The exam question text the teacher imported. */
  prompt: string;
  /** Human-readable skill the item exercises (task language, never a code). */
  skillName: string;
}

export interface ReflectionProbe {
  id: string;
  kind: ProbeKind;
  /** The formulated question the student answers in free text. */
  question: string;
  /** Which skill this probe is about, for grouping and the next-action step. */
  skillName: string;
  /** The minimum depth this specific probe demands (detailed > generic). */
  minWords: number;
}

// Cap how many individual items we walk so a long exam doesn't become an
// exhausting wall of screens; the per-skill "why" and the synthesis still cover
// the rest. This is a UX bound, and the surface should SAY when it applied.
export const MAX_ITEM_PROBES = 4;

const WHAT_HAPPENED =
  "On this question — {prompt} — walk me through exactly what you did, step by step, from the moment you read it.";
const WHY_WRONG =
  "For the {skill} work, where did your thinking first go a different way than you expected, and what did you believe was true that turned out not to be?";
const SYNTHESIS =
  "Across all of this, what is the one idea about {skill} you understand differently now than you did before you saw the results?";
const WHOLE_ASSESSMENT =
  "Walk me through how you worked through this, step by step — what felt solid, and where were you least sure?";
// Personalized from prior data. FOLLOW_THROUGH closes the last cycle's loop
// (Zimmerman self-reaction → next forethought) using the student's own committed
// action. SYNTHESIS_RECURRING points at the student's own established, controllable
// pattern — inviting them to confirm or refine it, never asserting it.
const FOLLOW_THROUGH =
  "Last time, you set out to {action}. Before we look at this round — how did that actually go?";
const SYNTHESIS_RECURRING =
  "Before, your reflections kept coming back to {cause}. Looking at {skill} now, is that the same thread again, or something new you can name?";

function firstSkill(items: readonly WrongItem[], fallback: string): string {
  return items[0]?.skillName ?? fallback;
}

/**
 * Build the ordered probe sequence for a student's missed items. Order is
 * deliberate: reconstruct WHAT HAPPENED on each item first (concrete, low-threat),
 * then WHY it diverged per skill (the misconception), then a SYNTHESIS that names
 * what changed (the academic journey). `truncated` is true when more items were
 * missed than we walk individually, so the surface can be honest about it.
 */
export function buildReflectionProbes(
  wrongItems: readonly WrongItem[],
  render: ReflectionRender,
  prior: PriorContext = EMPTY_PRIOR_CONTEXT,
): { probes: ReflectionProbe[]; truncated: boolean } {
  // A follow-through opener, present only when the student has a prior committed
  // action. It closes last cycle's loop before this cycle's work is examined.
  const followThrough: ReflectionProbe | null =
    prior.lastAction === null
      ? null
      : {
          id: "probe-follow-through",
          kind: "follow_through",
          question: render(FOLLOW_THROUGH, { action: prior.lastAction }),
          skillName: "your plan",
          minWords: 15,
        };

  // The synthesis is personalized when the student has an established, controllable
  // pattern: we point at their own words, inviting confirm-or-refine.
  const synthesisQuestion = (skill: string): string =>
    prior.recurringCause === null
      ? render(SYNTHESIS, { skill })
      : render(SYNTHESIS_RECURRING, {
          skill,
          cause: RECURRING_PHRASE[prior.recurringCause],
        });

  // Nothing missed → still reflect, on the process as a whole. Awareness is the
  // point even when the score is high (overconfidence hides here).
  if (wrongItems.length === 0) {
    return {
      probes: [
        ...(followThrough ? [followThrough] : []),
        {
          id: "probe-whole",
          kind: "what_happened",
          question: render(WHOLE_ASSESSMENT, {}),
          skillName: "this work",
          minWords: 20,
        },
        {
          id: "probe-synthesis",
          kind: "synthesis",
          question: synthesisQuestion("this work"),
          skillName: "this work",
          minWords: 20,
        },
      ],
      truncated: false,
    };
  }

  const walked = wrongItems.slice(0, MAX_ITEM_PROBES);
  const probes: ReflectionProbe[] = [];
  if (followThrough) probes.push(followThrough);

  walked.forEach((item, i) => {
    probes.push({
      id: `probe-what-${i}`,
      kind: "what_happened",
      question: render(WHAT_HAPPENED, { prompt: item.prompt, skill: item.skillName }),
      skillName: item.skillName,
      minWords: 15,
    });
  });

  // One "why" per distinct skill among the missed items, in first-seen order.
  const seen = new Set<string>();
  for (const item of walked) {
    if (seen.has(item.skillName)) continue;
    seen.add(item.skillName);
    probes.push({
      id: `probe-why-${item.skillName.replace(/\s+/g, "-")}`,
      kind: "why_wrong",
      question: render(WHY_WRONG, { skill: item.skillName }),
      skillName: item.skillName,
      minWords: 20,
    });
  }

  probes.push({
    id: "probe-synthesis",
    kind: "synthesis",
    question: synthesisQuestion(firstSkill(walked, "this work")),
    skillName: firstSkill(walked, "this work"),
    minWords: 25,
  });

  return { probes, truncated: wrongItems.length > walked.length };
}
