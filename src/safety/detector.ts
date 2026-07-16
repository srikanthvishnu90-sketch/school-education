import {
  LEXICON_VERSION,
  TIER_1_SOURCES,
  TIER_2_SOURCES,
} from "./lexicon";

/**
 * The crisis detector — a PURE, deterministic, synchronous function over free
 * text. Zero LLM, zero I/O, zero clock. Same text always yields the same result.
 * It ROUTES; it never assesses, scores, or advises. tier_1 (explicit) outranks
 * tier_2 (concerning) — the more urgent signal wins.
 */

export type CrisisTier = "tier_1" | "tier_2";

export interface CrisisDetection {
  tier: CrisisTier;
  /** The lexicon version that produced this detection — recorded on the escalation. */
  detectorVersion: string;
}

const TIER_1 = TIER_1_SOURCES.map((s) => new RegExp(s, "i"));
const TIER_2 = TIER_2_SOURCES.map((s) => new RegExp(s, "i"));

const SEPARATORS = /[\s._*|~+-]+/g;
const ELONGATION = /([a-z])\1{2,}/g;
// A run of 3+ single letters separated by separators — the classic "k i l l"
// spacing evasion. The run is anchored to word boundaries on both sides
// ((?<![a-z]) / (?![a-z])) so it only collapses genuinely spaced-out letters and
// never eats a neighbouring word's edge; ordinary spaced words ("skill myself")
// stay untouched, so de-obfuscation adds recall without a false-positive flood.
const SPACED_LETTERS = /(?<![a-z])(?:[a-z][\s._*|~+-]+){2,}[a-z](?![a-z])/g;

/**
 * Text variants the detector tries, so common obfuscations still route. All are
 * lossy-toward-detection (recall-biased, per the lexicon's design): letter-spacing
 * is joined, and character elongation is collapsed both ways (3+ → 1 and 3+ → 2),
 * since "kill" needs the doubled letter while "suicide" needs the single one.
 */
function candidates(text: string): string[] {
  const lower = text.normalize("NFKC").toLowerCase();
  const e1 = lower.replace(ELONGATION, "$1"); // killlll → kil / suuuicide → sucide? no: sui
  const e2 = lower.replace(ELONGATION, "$1$1"); // killlll → kill
  const join = (s: string): string =>
    s.replace(SPACED_LETTERS, (m) => m.replace(SEPARATORS, ""));
  return [lower, e1, e2, join(lower), join(e1), join(e2)];
}

export function detectCrisis(text: string): CrisisDetection | null {
  const forms = candidates(text);
  if (forms.some((h) => TIER_1.some((re) => re.test(h)))) {
    return { tier: "tier_1", detectorVersion: LEXICON_VERSION };
  }
  if (forms.some((h) => TIER_2.some((re) => re.test(h)))) {
    return { tier: "tier_2", detectorVersion: LEXICON_VERSION };
  }
  return null;
}
