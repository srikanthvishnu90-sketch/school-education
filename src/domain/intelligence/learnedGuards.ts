/**
 * The LEARNED layer of the safety guards — the part that lets the rules improve
 * over time instead of staying a frozen list. The base non-diagnostic lexicon
 * (nonDiagnostic.ts) is change-controlled and versioned; this sits ALONGSIDE it,
 * holding patterns promoted from real guardrail incidents.
 *
 * The loop is agentic but never reckless: a model output that trips a guard is
 * recorded as an incident (see app/_world/guardrailIncidents); a reviewer/agent
 * promotes the miss into a learned pattern here, which takes effect EVERYWHERE the
 * guard runs and bumps the version. Every promotion should ship with a regression
 * test, so a gap once found can never reopen. This is deterministic domain data —
 * a model never mutates it directly; it only surfaces the incident that prompts a
 * controlled promotion.
 */

interface LearnedPattern {
  pattern: RegExp;
  /** Human-readable reason this was added — shown to the next reviewer. */
  note: string;
}

const learned: LearnedPattern[] = [];
let version = 0;

/**
 * Add a diagnostic pattern the base lexicon missed. `source` is a regex source
 * string (matched case-insensitively). Idempotent on identical source so replays
 * don't inflate the version.
 */
export function learnDiagnosticPattern(source: string, note: string): void {
  if (learned.some((l) => l.pattern.source === source)) return;
  learned.push({ pattern: new RegExp(source, "i"), note });
  version += 1;
}

/** Notes for every learned pattern this text trips (empty when it trips none). */
export function learnedDiagnosticMatches(text: string): string[] {
  return learned.filter((l) => l.pattern.test(text)).map((l) => l.note);
}

/** How many learned patterns are active — bumps on each new promotion. */
export function learnedGuardVersion(): number {
  return version;
}

/** The learned patterns' notes, for an operator/audit surface. */
export function learnedGuardSummary(): readonly string[] {
  return learned.map((l) => l.note);
}

/** Test-only reset so suites don't leak learned state between cases. */
export function resetLearnedGuards(): void {
  learned.length = 0;
  version = 0;
}
