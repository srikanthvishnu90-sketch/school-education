import {
  createGeneratedQuestion,
  createReflectionQuestionSet,
  type GeneratedQuestion,
  type ReflectionQuestionSet,
} from "@/domain/intelligence/question";

/**
 * A demo-only, factoring-flavored question bank and a builder that draws a FRESH,
 * randomized survey each time. Unlike the deterministic generator (same lesson →
 * same questions, always), this deliberately varies the questions per run so the
 * whole survey process can be seen in action with a different set each time a
 * student opens the demo reflection.
 *
 * Nondeterministic BY DESIGN — it takes a random source (Math.random by default),
 * which is why it lives here in the demo layer, not in the pure domain. It still
 * hands back a fully-validated ReflectionQuestionSet, so the balance and length
 * invariants (≥1 technical + ≥1 emotional, 4–6 questions) always hold.
 */

type Draft = Pick<GeneratedQuestion, "category" | "text" | "format"> & {
  options?: string[];
};

const EMOTION_OPTIONS = [
  "confident", "frustrated", "confused", "rushed", "calm", "curious", "discouraged", "proud",
];

/** Technical openers — always a quick self-rating, used as question 1. */
const TECHNICAL_OPENERS: Draft[] = [
  { category: "technical", format: "rating", text: "How clear did factoring quadratics feel by the end of class today?" },
  { category: "technical", format: "rating", text: "Right now, how well do you think you could factor something like x² + 7x + 12?" },
  { category: "technical", format: "rating", text: "How clear was finding the two numbers that both multiply and add correctly?" },
];

/** Emotional questions — always one, used as question 2. */
const EMOTIONAL: Draft[] = [
  { category: "emotional", format: "emotion_select", text: "Which word best fits how factoring felt for you today?", options: EMOTION_OPTIONS },
  { category: "emotional", format: "confidence_slider", text: "How confident do you feel factoring a quadratic on your own now?" },
  { category: "emotional", format: "emotion_select", text: "When a factoring problem wouldn't crack, which word fit best?", options: EMOTION_OPTIONS },
];

/** The rest of the pool, drawn at random to fill out the survey. */
const POOL: Draft[] = [
  { category: "technical", format: "long_response", text: "Walk me through the moment factoring stopped making sense today." },
  { category: "technical", format: "short_response", text: "What tripped you up most — the signs, the middle term, or setting the problem up?" },
  { category: "technical", format: "short_response", text: "For x² + 5x + 6, how would you find the two numbers that work?" },
  { category: "technical", format: "long_response", text: "Pick one factoring problem from today and describe how you approached it." },
  { category: "behavioral", format: "multiple_choice", text: "When a factoring problem got hard, what did you do?", options: ["Kept trying on my own", "Asked for help", "Used my notes or examples", "Guessed and moved on", "Waited or stopped"] },
  { category: "behavioral", format: "multiple_choice", text: "How did you check whether your factors were right?", options: ["Multiplied them back out", "Plugged in a number", "Compared with a classmate", "Didn't check"] },
  { category: "behavioral", format: "multiple_choice", text: "When you weren't sure about the signs, what did you do?", options: ["Tested both signs", "Guessed", "Asked someone", "Skipped it"] },
  { category: "metacognitive", format: "short_response", text: "What's one thing you'll try next time you factor a tricky quadratic?" },
  { category: "metacognitive", format: "short_response", text: "What would make factoring feel easier for you next time?" },
  { category: "metacognitive", format: "short_response", text: "If you taught factoring to a friend, what's the first tip you'd give them?" },
];

/**
 * Always asked, last: surfaces anything outside class that got in the way. Free
 * text so the wellbeing detector can read it and (gently) flag it to the teacher.
 */
const OUTSIDE_CLASS_QUESTION: Draft = {
  category: "behavioral",
  format: "short_response",
  text: "Last one — did anything outside of class make it harder to focus or learn today? (Totally optional — “nothing” is fine.)",
};

function pickOne<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

/** Fisher–Yates using the supplied random source (leaves the input untouched). */
function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a fresh, randomized factoring survey. Guarantees a technical opener first
 * and an emotional question second (so the balance invariant always holds), then
 * fills the rest at random up to `count` (clamped to 4–6).
 */
export function buildFactoringSurvey(
  lessonId: string,
  now: () => Date,
  rand: () => number = Math.random,
  count = 5,
): ReflectionQuestionSet {
  const target = Math.min(6, Math.max(4, count));
  const drafts: Draft[] = [pickOne(TECHNICAL_OPENERS, rand), pickOne(EMOTIONAL, rand)];
  // Leave room for the always-last outside-of-class question.
  for (const draft of shuffled(POOL, rand)) {
    if (drafts.length >= target - 1) break;
    drafts.push(draft);
  }
  drafts.push(OUTSIDE_CLASS_QUESTION);
  const questions = drafts.map((d, i) =>
    createGeneratedQuestion({
      id: `factoring-q${i}`,
      order: i,
      category: d.category,
      text: d.text,
      format: d.format,
      options: d.options,
      required: i < 2,
      aiGenerated: true,
    }),
  );
  return createReflectionQuestionSet({
    lessonId,
    questions,
    adaptiveFollowupsEnabled: true,
    maxFollowups: 4,
    createdAt: now(),
  });
}
