/**
 * External-factor detection — a PURE, deterministic, synchronous scan for signs
 * that something OUTSIDE school (home, work, sleep, caregiving, loss, being
 * over-committed) may be making school harder right now. It mirrors the crisis
 * detector's philosophy (src/safety/detector) but is a SEPARATE, lower-stakes
 * path: it never touches the self-harm crisis route, and it only surfaces a
 * gentle prompt to the teacher — it never diagnoses.
 *
 * Two hard rules, straight from CLAUDE.md:
 *  - AI = labor, not judgment. This is deterministic ROUTING over the student's
 *    own words; no model decides whether to flag, and nothing here concludes
 *    anything about who the student "is".
 *  - Non-diagnostic. A hit means the student SAID something worth a caring
 *    check-in — surfaced with their own words as evidence, never as a label.
 *
 * Recall is favoured only mildly: a false positive here is a quiet, private
 * teacher check-in, so the bar is "the student named a real outside pressure",
 * not ordinary academic frustration.
 */

export const EXTERNAL_FACTOR_DETECTOR_VERSION = "2026.07.10";

export type ExternalFactorCategory =
  | "home_family"
  | "caregiving"
  | "work_job"
  | "sleep"
  | "basic_needs"
  | "health"
  | "loss"
  | "overwhelmed";

/** Teacher-facing, non-diagnostic phrasing for each category (observed, gentle). */
export const EXTERNAL_FACTOR_LABELS: Record<ExternalFactorCategory, string> = {
  home_family: "something going on at home",
  caregiving: "caring for family at home",
  work_job: "a job or work hours",
  sleep: "not sleeping enough / exhaustion",
  basic_needs: "money, food, or housing",
  health: "their health or a medical issue",
  loss: "a loss or grief",
  overwhelmed: "a lot going on outside class (sports, clubs, and the like)",
};

/**
 * The reviewable lexicon. Patterns are anchored to real outside-school pressure so
 * that ordinary school talk ("I did it at home", "this was hard") does not match.
 * Any edit here should bump EXTERNAL_FACTOR_DETECTOR_VERSION.
 */
const SOURCES: Record<ExternalFactorCategory, readonly string[]> = {
  home_family: [
    "\\b(stuff|things|something|a lot|problems?|issues?|drama|trouble)\\b[^.?!]{0,20}\\bat home\\b",
    "\\bat home\\b[^.?!]{0,20}\\b(rough|hard|crazy|stressful|tough|a lot)\\b",
    "\\b(fighting|arguing|yelling|screaming) at home\\b",
    "\\bmy parents?\\b[^.?!]{0,20}\\b(fighting|arguing|divorc\\w*|splitting|separat\\w*)\\b",
    "\\bhome (life|situation|stuff)\\b",
  ],
  caregiving: [
    "\\b(taking|take|took|watching|watch|look(ing)? after|caring for) (care of )?my (little )?(brother|sister|sibling|siblings|mom|mother|grandma|grandmother|family)\\b",
    "\\bbabysit\\w*\\b",
    "\\bhelp(ing)? (out )?(a lot )?at home\\b",
  ],
  work_job: [
    "\\bmy (job|shift|work)\\b[^.?!]{0,15}\\b(ran|went|until|till|late|long)\\b",
    "\\bworking (late|nights?|after school|a lot|doubles)\\b",
    "\\bhad to work\\b",
    "\\bclos(e|ed|ing) (up )?(the )?(store|shop|restaurant)\\b",
  ],
  sleep: [
    "\\b(couldn'?t|can'?t|didn'?t|barely) sleep\\b",
    "\\bup (all|half the|most of the) night\\b",
    "\\bno sleep\\b",
    "\\b(so|really|super|too) (tired|exhausted|sleepy)\\b",
    "\\bexhausted\\b",
    "\\bhaven'?t slept\\b",
  ],
  basic_needs: [
    "\\b(couldn'?t|can'?t) afford\\b",
    "\\bno (money|food)\\b",
    "\\b(we|i) (don'?t|didn'?t) have (enough )?(money|food)\\b",
    "\\b(hungry|starving)\\b",
    "\\b(evict\\w*|kicked out|lost (our|the) (house|apartment)|homeless)\\b",
    "\\bmoving (out|again|houses|to a)\\b",
  ],
  health: [
    "\\bi'?ve? (was|been|am) (really |very )?sick\\b",
    "\\bi (was|got) (really |very )?sick\\b",
    "\\b(in|at) the hospital\\b",
    "\\bnot feeling well\\b",
    "\\bmy (health|meds|medication|migraines?)\\b",
    "\\bdoctor'?s? appointment\\b",
  ],
  loss: [
    "\\bpassed away\\b",
    "\\b(funeral|a death in)\\b",
    "\\bmy (grandma|grandmother|grandpa|grandfather|mom|mother|dad|father|aunt|uncle|cousin|friend|pet|dog|cat) (died|passed)\\b",
  ],
  overwhelmed: [
    "\\b(too much|so much) going on\\b",
    "\\bpractice\\b[^.?!]{0,15}\\b(ran|went|until|till|late|long)\\b",
    "\\b(game|meet|tournament|rehearsal|recital)\\b[^.?!]{0,15}\\b(ran|went|until|till|late|last night)\\b",
    "\\bno time\\b[^.?!]{0,15}\\b(because|since|with)\\b",
    "\\b(overwhelmed|spread too thin|burn(t|ed) out)\\b",
    "\\b(so|really|super) busy (with|because)\\b",
  ],
};

const COMPILED: [ExternalFactorCategory, RegExp[]][] = (
  Object.keys(SOURCES) as ExternalFactorCategory[]
).map((cat) => [cat, SOURCES[cat].map((s) => new RegExp(s, "i"))]);

export interface ExternalFactorSignal {
  categories: ExternalFactorCategory[];
  detectorVersion: string;
}

/**
 * Scan one piece of text. Returns every category it matches (a student may name
 * more than one), or null if nothing outside-school surfaced. Pure and stable:
 * same text → same result, no I/O, no clock.
 */
export function detectExternalFactors(text: string): ExternalFactorSignal | null {
  const haystack = text.normalize("NFKC");
  const categories: ExternalFactorCategory[] = [];
  for (const [cat, regexes] of COMPILED) {
    if (regexes.some((re) => re.test(haystack))) categories.push(cat);
  }
  return categories.length === 0
    ? null
    : { categories, detectorVersion: EXTERNAL_FACTOR_DETECTOR_VERSION };
}

/** The teacher-facing labels for a set of categories, in the canonical order. */
export function externalFactorLabels(
  categories: readonly ExternalFactorCategory[],
): string[] {
  const set = new Set(categories);
  return (Object.keys(EXTERNAL_FACTOR_LABELS) as ExternalFactorCategory[])
    .filter((c) => set.has(c))
    .map((c) => EXTERNAL_FACTOR_LABELS[c]);
}
