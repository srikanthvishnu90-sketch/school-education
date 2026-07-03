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

/** How the render slots are phrased into a question. `render` fills the slots. */
export type ReflectionRender = (
  template: string,
  slots: Readonly<Record<string, string>>,
) => string;

export type ProbeKind = "what_happened" | "why_wrong" | "synthesis";

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
): { probes: ReflectionProbe[]; truncated: boolean } {
  // Nothing missed → still reflect, on the process as a whole. Awareness is the
  // point even when the score is high (overconfidence hides here).
  if (wrongItems.length === 0) {
    return {
      probes: [
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
          question: render(SYNTHESIS, { skill: "this work" }),
          skillName: "this work",
          minWords: 20,
        },
      ],
      truncated: false,
    };
  }

  const walked = wrongItems.slice(0, MAX_ITEM_PROBES);
  const probes: ReflectionProbe[] = [];

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
    question: render(SYNTHESIS, { skill: firstSkill(walked, "this work") }),
    skillName: firstSkill(walked, "this work"),
    minWords: 25,
  });

  return { probes, truncated: wrongItems.length > walked.length };
}
