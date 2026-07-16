import { DomainError } from "../common";
import { learnedDiagnosticMatches } from "./learnedGuards";

/**
 * The non-diagnostic guard (spec → Product principle 4: "Do not diagnose").
 * Every AI-authored summary or message a teacher or student sees must pass this
 * before it leaves the system. It permits transient, observed language
 * ("reported feeling rushed", "appears hesitant to ask for help") and forbids
 * clinical labels and fixed-trait verdicts about a student.
 *
 * This is a CURATED, change-controlled list — like the crisis lexicon, its edits
 * are a deliberate safety decision, not a casual tweak. It is intentionally
 * conservative: better to reject a borderline phrase and re-draft than to let a
 * diagnosis reach a child's teacher.
 */

export const NON_DIAGNOSTIC_LEXICON_VERSION = "1.0.0";

// Clinical / condition nouns used as a label of the student.
const CONDITION_LABELS =
  /\b(anxiety disorder|depression|depressed|bipolar|ptsd|adhd|autism|autistic|dyslexi\w*|dyscalculi\w*|trauma(tized)?|learning disabilit(y|ies)|mental[- ](health )?(disorder|illness|condition)|personality disorder|emotionally unstable)\b/i;

// "The student has / suffers from / is diagnosed with <condition>."
const DIAGNOSTIC_ATTRIBUTION =
  /\b(has|have|shows signs of|exhibits|suffers from|struggles with|diagnos(ed|is))\b[^.]{0,24}\b(anxiety|depression|adhd|autism|dyslexia|trauma|disorder|disability|condition|illness)\b/i;

// Fixed-trait verdicts about the person rather than the work.
const FIXED_TRAIT =
  /\b(is|seems to be|is just)\s+(?:a\s+)?(lazy|stupid|dumb|unmotivated|incapable|not smart|a slow learner|hopeless|broken)\b/i;

const PATTERNS: readonly RegExp[] = [
  CONDITION_LABELS,
  DIAGNOSTIC_ATTRIBUTION,
  FIXED_TRAIT,
];

/**
 * Every diagnostic phrase found in `text` (empty ⇒ the text is safe). Consults
 * BOTH the base lexicon and the learned layer (learnedGuards), so a pattern
 * promoted from a real incident strengthens this guard everywhere at once.
 */
export function findDiagnosticLanguage(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (match) hits.push(match[0]);
  }
  hits.push(...learnedDiagnosticMatches(text));
  return hits;
}

export function isNonDiagnostic(text: string): boolean {
  return findDiagnosticLanguage(text).length === 0;
}

/** Throws if the text diagnoses or fixes a trait — call before any summary ships. */
export function assertNonDiagnostic(text: string): void {
  const hits = findDiagnosticLanguage(text);
  if (hits.length > 0) {
    throw new DomainError(
      `diagnostic / fixed-trait language is not allowed in a summary: ${hits
        .map((h) => `"${h}"`)
        .join(", ")}`,
    );
  }
}
