/**
 * Intent routing for a student's chat answer, plus the contextual follow-up an
 * unusable answer earns. This is the deterministic core of "handle any answer
 * gracefully": classify the reply (direct / off-topic / gibberish / refusal /
 * ambiguous) and, when it can't be used, produce a polite, question-anchored probe
 * instead of blindly moving on.
 *
 * Pure and zero-LLM by design — this is the always-works fallback. Per CLAUDE.md
 * the FLOW stays deterministic (the model never decides the next step); a language
 * adapter may reword the follow-up, but the routing decision is made here. This is
 * the plumb-native form of a "fallback intent-routing + dynamic contextual
 * prompting" system: the deterministic layer is layer-1 routing AND the fallback
 * for the model layer.
 */

export type ResponseCategory =
  | "direct"
  | "off_topic"
  | "gibberish"
  | "refusal"
  | "ambiguous";

export interface ResponseIntent {
  category: ResponseCategory;
  /** True when the answer can't be used as-is and deserves a follow-up. */
  isUnpredictable: boolean;
}

const REFUSAL =
  /\b(i (won'?t|wont|don'?t want to|do ?n'?t wanna|refuse)|no comment|none of your business|not (going to |gonna )?(say|answer|tell)|rather not|prefer not to|leave me alone|not saying|won'?t answer)\b|^\s*(pass|skip( this)?|no thanks?)\s*[.!]*$/i;

const AMBIGUOUS =
  /^(idk|dunno|i don'?t know|i dont know|not sure|no idea|maybe|meh|ok|okay|k|yes|yeah|yep|no|nope|nah|kind of|kinda|sort of|i guess|whatever|shrug|\?+)[.!?]*$/i;

const OFF_TOPIC_MARKERS =
  /\b(unrelated|off[- ]topic|random|nvm|never ?mind|idc|i don'?t care|who cares|blah blah)\b/i;

function looksGibberish(text: string): boolean {
  const collapsed = text.replace(/\s+/g, "");
  if (collapsed.length < 4) return false; // too short to call — treat as ambiguous
  const letters = collapsed.replace(/[^a-z]/gi, "");
  // Mostly symbols / key-mash rather than words.
  if (letters.length / collapsed.length < 0.5) return true;
  // Any long token that reads like key-mash: a very low vowel ratio, or a long
  // run of consonants (asdfghjkl, qwerty, hjkl).
  return text
    .trim()
    .split(/\s+/)
    .some((w) => {
      if (w.length < 6) return false;
      const vowels = (w.match(/[aeiouy]/gi) ?? []).length;
      return vowels / w.length < 0.2 || /[bcdfghjklmnpqrstvwxz]{5,}/i.test(w);
    });
}

/**
 * Route one answer. Off-topic detection is deliberately conservative (explicit
 * markers only) so honest answers are never mislabeled; a language adapter can add
 * semantic off-topic detection on top.
 */
export function classifyResponse(answer: string): ResponseIntent {
  const t = answer.trim();
  if (t.length === 0) return { category: "refusal", isUnpredictable: true };
  if (REFUSAL.test(t)) return { category: "refusal", isUnpredictable: true };
  if (looksGibberish(t)) return { category: "gibberish", isUnpredictable: true };
  if (AMBIGUOUS.test(t)) return { category: "ambiguous", isUnpredictable: true };
  if (OFF_TOPIC_MARKERS.test(t)) return { category: "off_topic", isUnpredictable: true };
  return { category: "direct", isUnpredictable: false };
}

/** Trim a question to a short focus clause for embedding in a follow-up. */
function focus(question: string): string {
  const q = question.trim().replace(/\s+/g, " ");
  return q.length <= 90 ? q : `${q.slice(0, 87).trimEnd()}…`;
}

/**
 * The polite, question-anchored follow-up an unusable answer earns — the "dynamic
 * contextual prompting". Deterministic phrasing (a language adapter may reword it);
 * never leads, never shames, and a refusal is always honored with an out.
 */
export function contextualFollowup(
  category: ResponseCategory,
  question: string,
): string {
  switch (category) {
    case "refusal":
      return "That's completely okay — you can skip this one. If you change your mind, even a word or two helps.";
    case "gibberish":
      return `I didn't quite catch that. In your own words — ${focus(question)}`;
    case "off_topic":
      return `Ha, fair enough. Let's come back to it, though: ${focus(question)}`;
    case "ambiguous":
      return "No worries. Thinking back to a specific moment, what's the first thing that comes to mind?";
    case "direct":
    default:
      return "Tell me a little more?";
  }
}
