/**
 * The PPRA guard — the machine-checkable form of plumb's "we screen protected
 * survey topics out of student-facing questions" rule.
 *
 * The Protection of Pupil Rights Amendment (PPRA, 20 U.S.C. § 1232h) restricts a
 * school from requiring a student to answer a survey that reveals information in
 * eight federally protected areas without prior written parental consent. plumb
 * asks students reflective questions — some AI-drafted — so any generated prompt
 * that probes one of those eight areas is a compliance and child-safety hazard,
 * not merely off-topic. This guard flags such probes so they never reach a
 * student, exactly as the crisis, companion, and non-diagnostic guards flag their
 * own hazards.
 *
 * It is a CURATED, change-controlled lexicon, like companionGuard and
 * nonDiagnostic: every edit to a pattern is a deliberate compliance decision, and
 * the version string below is bumped when the lexicon changes. It is intentionally
 * NARROW — it targets genuine PROBES of a protected area ("how do your parents
 * vote", "what is your family's income"), never the ordinary academic content
 * where these words appear innocently ("how confident were you solving the
 * quadratic?", "explain the causes of the Civil War").
 *
 * PURE domain module: no imports from react, next, or any adapter.
 */

/**
 * The eight PPRA-protected survey areas (20 U.S.C. § 1232h(c)(1)(A)-(H)). Closed
 * taxonomy — a screened hit always maps to exactly one of these.
 */
export enum PpraCategory {
  /** (A) Political affiliations or beliefs of the student or the student's parent. */
  PoliticalAffiliations = "political_affiliations",
  /** (B) Mental or psychological problems of the student or the student's family. */
  MentalHealth = "mental_health",
  /** (C) Sex behavior or attitudes. */
  SexBehaviorAttitudes = "sex_behavior_attitudes",
  /** (D) Illegal, anti-social, self-incriminating, or demeaning behavior. */
  IllegalAntisocialSelfIncriminating = "illegal_antisocial_self_incriminating",
  /** (E) Critical appraisals of other individuals with whom the student has a close family relationship. */
  CriticalAppraisalsOfFamily = "critical_appraisals_of_family",
  /** (F) Legally recognized privileged relationships (lawyers, physicians, ministers). */
  PrivilegedRelationships = "privileged_relationships",
  /** (G) Religious practices, affiliations, or beliefs of the student or the student's parent. */
  ReligiousPracticesBeliefs = "religious_practices_beliefs",
  /** (H) Income (other than as required by law to determine program eligibility). */
  Income = "income",
}

export const PPRA_LEXICON_VERSION = "1.0.0";

/**
 * Per-category probe patterns. Each entry is a category plus the regexes that read
 * as a genuine probe of that protected area. Every pattern is case-insensitive.
 * Patterns are deliberately anchored to a PROBE shape (a question TO the student
 * about the protected fact) so ordinary academic language — a history lesson about
 * "political parties", a chemistry question about "alcohol", a literature prompt on
 * a novel's "religion" — does not trip the guard.
 */
const PPRA_PATTERNS: readonly (readonly [PpraCategory, RegExp])[] = [
  // (A) Political affiliations / beliefs of the student or their parents.
  [PpraCategory.PoliticalAffiliations, /\bwho (?:do|did|does|will) (?:you|your (?:parents?|family|mom|dad|mother|father)) (?:vote|voting) for\b/i],
  [PpraCategory.PoliticalAffiliations, /\bhow (?:do|did|does|will) (?:you|your (?:parents?|family|mom|dad|mother|father)) vote\b/i],
  [PpraCategory.PoliticalAffiliations, /\bwhat (?:political )?party (?:do|does|are) (?:you|your (?:parents?|family|mom|dad|mother|father))\b/i],
  [PpraCategory.PoliticalAffiliations, /\b(?:are|is) (?:you|your (?:parents?|family|mom|dad|mother|father)) (?:a )?(?:democrat|republican|liberal|conservative)\b/i],
  [PpraCategory.PoliticalAffiliations, /\bwhat are your (?:political )?(?:beliefs|views|affiliations?)\b/i],

  // (B) Mental or psychological problems of the student or their family.
  [PpraCategory.MentalHealth, /\b(?:do|have) you (?:ever )?(?:been|felt|had) (?:diagnosed with |treated for )?(?:depress\w*|anxious|anxiety|suicidal)\b/i],
  [PpraCategory.MentalHealth, /\bhave you (?:ever )?(?:seen|been to|talked to) (?:a )?(?:therapist|psychiatrist|counselor)(?: about| for)?\b/i],
  [PpraCategory.MentalHealth, /\b(?:does|do) (?:anyone in your (?:family|home)|your (?:parents?|family|mom|dad)) have (?:a )?(?:mental (?:health |illness)|psychological)\b/i],
  [PpraCategory.MentalHealth, /\b(?:are you|have you been) (?:on|taking) (?:any )?(?:medication|meds) for (?:your )?(?:mood|mental|depress\w*|anxiety)\b/i],
  [PpraCategory.MentalHealth, /\bwhat mental (?:health|illness) (?:problems?|conditions?|issues?) (?:do|does) (?:you|your family)\b/i],

  // (C) Sex behavior or attitudes.
  [PpraCategory.SexBehaviorAttitudes, /\b(?:are|have) you (?:ever )?(?:been )?sexually active\b/i],
  [PpraCategory.SexBehaviorAttitudes, /\bhave you (?:ever )?had sex\b/i],
  [PpraCategory.SexBehaviorAttitudes, /\bwhat is your (?:sexual orientation|gender identity)\b/i],
  [PpraCategory.SexBehaviorAttitudes, /\b(?:do you|are you) (?:have a )?(?:boyfriend|girlfriend|dating|attracted to)\b/i],
  [PpraCategory.SexBehaviorAttitudes, /\bhow (?:do you feel|many partners) (?:about (?:sex|sexual)|have you)\b/i],

  // (D) Illegal, anti-social, self-incriminating, or demeaning behavior.
  [PpraCategory.IllegalAntisocialSelfIncriminating, /\b(?:do|does|have) (?:you|anyone in your (?:home|family)|your (?:parents?|family)) (?:ever )?(?:drink|use|used|do|take) (?:alcohol|drugs?|weed|marijuana)\b/i],
  [PpraCategory.IllegalAntisocialSelfIncriminating, /\bhave you (?:ever )?(?:used|tried|taken) (?:drugs?|alcohol|weed|marijuana|cocaine|vap\w*)\b/i],
  [PpraCategory.IllegalAntisocialSelfIncriminating, /\bhave you (?:ever )?(?:broken the law|been arrested|stolen|shoplifted|cheated)\b/i],
  [PpraCategory.IllegalAntisocialSelfIncriminating, /\b(?:do you|have you ever) (?:drink|drank|smoke|smoked|used a fake id)\b/i],
  [PpraCategory.IllegalAntisocialSelfIncriminating, /\bhas anyone in your (?:home|family) (?:ever )?(?:been (?:arrested|to jail|in prison)|broken the law)\b/i],

  // (E) Critical appraisals of individuals with a close family relationship.
  [PpraCategory.CriticalAppraisalsOfFamily, /\bwhat (?:do you (?:dislike|not like|hate)|is wrong)\b[^.?!]{0,15}?\b(?:about|with) your (?:parents?|mom|dad|mother|father|family|siblings?)\b/i],
  [PpraCategory.CriticalAppraisalsOfFamily, /\bhow would you rate your (?:parents?|mom|dad|mother|father|family)\b/i],
  [PpraCategory.CriticalAppraisalsOfFamily, /\b(?:are|do) your (?:parents?|mom|dad|mother|father) (?:a )?(?:good|bad) (?:parents?|at)\b/i],
  [PpraCategory.CriticalAppraisalsOfFamily, /\bwhat (?:are|is) your (?:parents?['’]?|family['’]?s?) (?:worst|biggest) (?:faults?|flaws?|problems?)\b/i],

  // (F) Legally recognized privileged relationships (lawyer / physician / minister).
  [PpraCategory.PrivilegedRelationships, /\bwhat (?:did|does) (?:your|the)\b[^.?]{0,20}\b(?:lawyer|attorney|doctor|physician|minister|priest|pastor|clergy) (?:tell|say to) (?:you|your family)\b/i],
  [PpraCategory.PrivilegedRelationships, /\bhas your family (?:ever )?(?:seen|hired|talked to) (?:a )?(?:lawyer|attorney)\b/i],
  [PpraCategory.PrivilegedRelationships, /\bwhat (?:did you (?:tell|say to)|do you talk to) your (?:doctor|physician|lawyer|attorney|minister|priest|pastor)\b/i],

  // (G) Religious practices, affiliations, or beliefs of the student or their parents.
  [PpraCategory.ReligiousPracticesBeliefs, /\bwhat religion (?:are|is|do) (?:you|your (?:parents?|family|mom|dad|mother|father))\b/i],
  [PpraCategory.ReligiousPracticesBeliefs, /\b(?:do you|does your family) (?:go to|attend) (?:church|temple|mosque|synagogue|religious services)\b/i],
  [PpraCategory.ReligiousPracticesBeliefs, /\b(?:do you|does your family) (?:believe in god|pray|practice (?:a )?religion)\b/i],
  [PpraCategory.ReligiousPracticesBeliefs, /\bwhat (?:are your|is your family['’]?s?) religious (?:beliefs?|practices?|affiliations?)\b/i],
  [PpraCategory.ReligiousPracticesBeliefs, /\bhow often do (?:you|your family) (?:pray|attend (?:church|services)|go to (?:church|temple|mosque|synagogue))\b/i],

  // (H) Income.
  [PpraCategory.Income, /\bwhat (?:is|are) your (?:family['’]?s?|parents?['’]?|household) (?:income|salary|wages?|earnings?)\b/i],
  [PpraCategory.Income, /\bhow much (?:money )?(?:do|does) your (?:parents?|family|mom|dad|mother|father) (?:make|earn)\b/i],
  [PpraCategory.Income, /\bhow much (?:money )?does your (?:family|household) (?:make|earn|bring in)\b/i],
  [PpraCategory.Income, /\bwhat (?:is|does) your (?:parents?['’]?|family['’]?s?) (?:job|salary) (?:pay|earn)\b/i],
];

/**
 * Screen `text` for probes of any PPRA-protected area. Returns whether any probe
 * matched (`hit`) and the distinct, order-stable list of protected categories the
 * text touches. Pure and case-insensitive; no side effects.
 */
export function screenForPpra(text: string): {
  hit: boolean;
  categories: PpraCategory[];
} {
  const categories: PpraCategory[] = [];
  for (const [category, pattern] of PPRA_PATTERNS) {
    if (pattern.test(text) && !categories.includes(category)) {
      categories.push(category);
    }
  }
  return { hit: categories.length > 0, categories };
}

/**
 * Convenience predicate: true when `text` probes any PPRA-protected topic. Use as
 * a guard on student-facing questions before they ship.
 */
export function probesProtectedTopic(text: string): boolean {
  return screenForPpra(text).hit;
}
