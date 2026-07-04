/**
 * The rule that decides when a free-response answer is ANSWERED enough to move on.
 * It is deterministic and rule-based (no LLM), and it never judges the CONTENT of
 * an answer or feeling — there is no right or wrong answer here. It only confirms
 * a genuine answer was given: not blank, not a filler non-answer ("idk"), not a
 * single word, not padding. Any real attempt in the student's own words passes and
 * they move straight on. The nudges are short, kind, and concrete for a young reader.
 */

export interface DepthConfig {
  /** The minimum number of words for an answer to read as a real attempt. */
  minWords: number;
  /** The minimum characters, guarding against a few one/two-letter tokens. */
  minChars: number;
}

// A gentle floor, not a length target: enough to be a real answer, never enough
// to feel like "the app wants more." A short honest sentence clears it.
export const DEFAULT_DEPTH: DepthConfig = { minWords: 3, minChars: 8 };

// Explicit non-answers: the student typed something, but it does not answer the
// question. Matched after stripping surrounding punctuation, case-insensitively.
const NON_ANSWERS: ReadonlySet<string> = new Set([
  "idk",
  "dk",
  "dunno",
  "i dont know",
  "i don't know",
  "dont know",
  "don't know",
  "no idea",
  "not sure",
  "nothing",
  "none",
  "n/a",
  "na",
  "nope",
  "nvm",
  "whatever",
]);

export interface DepthResult {
  ok: boolean;
  /** A short, basic nudge when the question is not answered yet; null when ok. */
  hint: string | null;
}

export function assessDepth(
  text: string,
  config: DepthConfig = DEFAULT_DEPTH,
): DepthResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, hint: "Write a little here first." };
  }

  // A recognised non-answer: acknowledge it, then invite the real one. Never
  // says the answer is wrong — only that the question is still open.
  const normalized = trimmed.toLowerCase().replace(/[.!?,]+$/g, "").trim();
  if (NON_ANSWERS.has(normalized)) {
    return {
      ok: false,
      hint: "Any honest answer works — there is no right one. What actually happened?",
    };
  }

  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const distinct = new Set(words.map((w) => w.toLowerCase())).size;

  // Just make sure the question is actually answered — a few words in their own
  // words is plenty. This is a floor, not a length the answer has to reach.
  if (words.length < config.minWords || trimmed.length < config.minChars) {
    return {
      ok: false,
      hint: "Say it in your own words — even a short answer is fine.",
    };
  }
  // Guard against padding one word out (e.g. "because because because").
  if (distinct < Math.ceil(words.length * 0.5)) {
    return {
      ok: false,
      hint: "Try it in your own words — the real reason, even if it is small.",
    };
  }
  return { ok: true, hint: null };
}
