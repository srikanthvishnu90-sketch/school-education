/**
 * PII stripping — runs on every payload before it can leave the process for the
 * model. Student writing is untrusted and private; names, emails, and any
 * identifier that could re-identify a learner are redacted to fixed placeholders.
 * Deterministic and rule-based: same input → same redaction, always.
 *
 * This is defense in depth, not the only line — the transport also assumes a
 * zero-data-retention key. But the boundary must not depend on that assumption.
 */

export interface Redaction {
  clean: string;
  /** How many spans were replaced — surfaced in tests, never the raw spans. */
  count: number;
}

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
// Adapter/tenant style identifiers: a word, a hyphen, then an id-ish tail.
const ID_TOKEN = /\b[a-z]+-[a-z0-9]{2,}(?:-[a-z0-9]+)*\b/gi;
// Any run of 5+ digits (student numbers, ids).
const LONG_NUMBER = /\b\d{5,}\b/g;

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redact emails, identifier tokens, long digit runs, and any explicitly-known
 * terms (student names/ids the caller holds). `extraTerms` covers proper nouns a
 * generic rule can't safely catch without over-redacting ordinary words.
 */
export function stripPii(
  text: string,
  extraTerms: readonly string[] = [],
): Redaction {
  let count = 0;
  const tally = (): string => {
    count++;
    return "[redacted]";
  };

  let out = text.replace(EMAIL, tally);
  for (const term of extraTerms) {
    const trimmed = term.trim();
    if (trimmed.length === 0) continue;
    out = out.replace(new RegExp(`\\b${escape(trimmed)}\\b`, "gi"), tally);
  }
  out = out.replace(ID_TOKEN, tally).replace(LONG_NUMBER, tally);
  return { clean: out, count };
}
