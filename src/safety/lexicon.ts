import { createHash } from "node:crypto";

/**
 * The crisis lexicon — a REVIEWABLE, VERSIONED config the deterministic detector
 * reads. It is recall-biased BY DESIGN: this path routes a student to humans, so
 * a false positive (a caring adult is told, resources are shown) is acceptable and
 * a false negative is not. It never assesses the student; it only decides whether
 * to route.
 *
 * Two tiers:
 *   · tier_1 — explicit intent/plan language → escalate immediately.
 *   · tier_2 — concerning, ideation-adjacent language → escalate, lower urgency.
 *
 * Change control (P16 acceptance): every edit to the sources below MUST bump
 * `LEXICON_VERSION` and append a `LEXICON_CHANGELOG` entry recording the new
 * content hash. The lock test fails CI on any content change that isn't recorded,
 * so the lexicon can never drift silently. The changelog is append-only.
 */

export const LEXICON_VERSION = "2026.07.23";

/**
 * Explicit self-directed intent or plan. Anchored to self-reference ("myself",
 * "my life", "end it") so ordinary academic idioms ("this test killed me") do not
 * match, while genuine statements of intent do.
 */
export const TIER_1_SOURCES: readonly string[] = [
  "\\bkill(ing)? myself\\b",
  "\\bkill my ?self\\b",
  "\\bend(ing)? my life\\b",
  "\\btake (my|my own) life\\b",
  "\\bi (want|wanna|am going|'?m going|plan) to die\\b",
  "\\bi (want|wanna) to end (it|it all|my life)\\b",
  "\\bgoing to end it( all)?\\b",
  "\\bi (have|made) a (suicide )?plan\\b",
  "\\bhow (to|do i) (kill|end) (myself|my life)\\b",
  "\\bhurt(ing)? my ?self\\b",
  "\\bi'?m going to (kill|end)\\b",
  "\\bsuicid(e|al)\\b",
  "\\boverdose\\b",
];

/**
 * Ideation-adjacent / concerning. Lower urgency; still routed to a human. Kept
 * distinct from mere academic frustration.
 */
export const TIER_2_SOURCES: readonly string[] = [
  "\\bi (hate|can'?t stand) (myself|my life)\\b",
  "\\bi wish i (was|were|wasn'?t) (dead|here|alive|born)\\b",
  "\\bno (reason|point) (to|in) liv(e|ing)\\b",
  "\\b(everyone|they|you'?d all)\\b[^.?!]{0,24}?\\bbe better (off )?without me\\b",
  "\\bi (can'?t|cannot) (go on|do this any ?more|keep going)\\b",
  "\\bi (want|wanna) to disappear\\b",
  "\\bbetter off dead\\b",
  "\\bself[ -]?harm\\b",
  "\\bcut(ting)? myself\\b",
  "\\bi (feel|am) (so )?hopeless\\b",
  "\\bi give up on everything\\b",
];

export interface ChangelogEntry {
  version: string;
  /** sha256 of the tier sources at this version. */
  contentHash: string;
  note: string;
}

/** Content hash of the tier sources — pure over the lexicon content, not version. */
export function lexiconContentHash(): string {
  const payload = JSON.stringify({
    tier1: TIER_1_SOURCES,
    tier2: TIER_2_SOURCES,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Append-only. The LAST entry must name `LEXICON_VERSION` and carry the current
 * content hash; the lock test enforces it. To change the lexicon: edit the sources,
 * bump `LEXICON_VERSION`, append a new entry with the note and the new hash.
 */
export const LEXICON_CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "2026.07.03",
    contentHash:
      "05906b3fe9c1e193ed761e0d3f3aa6283a7b2dddef50927a94d7029341fe56ec",
    note: "Initial recall-biased crisis lexicon (tier_1 intent/plan, tier_2 ideation-adjacent).",
  },
  {
    version: "2026.07.23",
    contentHash:
      "b13b0fb3408823270bf3eb7fcaeb53ee690bfb1f7f9930f7d6f89fa819855f69",
    note: "tier_2 burdensomeness: allow a bounded intervening qualifier between the subject and 'be better off without me' (catches 'everyone in my family would be better off without me'). Recall generalization surfaced by the eval harness.",
  },
];
