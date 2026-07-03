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

export function detectCrisis(text: string): CrisisDetection | null {
  const haystack = text.normalize("NFKC");
  if (TIER_1.some((re) => re.test(haystack))) {
    return { tier: "tier_1", detectorVersion: LEXICON_VERSION };
  }
  if (TIER_2.some((re) => re.test(haystack))) {
    return { tier: "tier_2", detectorVersion: LEXICON_VERSION };
  }
  return null;
}
