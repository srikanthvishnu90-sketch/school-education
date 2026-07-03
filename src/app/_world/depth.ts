/**
 * The internal criteria a free-response answer must meet before the student can
 * move on. It is deterministic and rule-based (no LLM): it checks that the answer
 * is long enough, uses enough different words (not "idk idk idk"), and is more
 * than a single word. The nudges are written for a young reader — short, kind,
 * concrete. It never judges the CONTENT of a feeling or answer, only that a real
 * answer was given.
 */

export interface DepthConfig {
  minWords: number;
  minChars: number;
}

export const DEFAULT_DEPTH: DepthConfig = { minWords: 12, minChars: 45 };

export interface DepthResult {
  ok: boolean;
  /** A short, basic nudge when the answer is not deep enough yet; null when ok. */
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

  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const distinct = new Set(words.map((w) => w.toLowerCase())).size;

  if (words.length < config.minWords || trimmed.length < config.minChars) {
    return {
      ok: false,
      hint: "Tell me a little more. What were you really thinking?",
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
