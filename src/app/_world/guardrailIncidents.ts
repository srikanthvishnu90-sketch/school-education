import { createHash } from "node:crypto";
import {
  NON_DIAGNOSTIC_LEXICON_VERSION,
  learnDiagnosticPattern,
  learnedGuardSummary,
  learnedGuardVersion,
} from "@/domain/intelligence";
import type {
  GuardrailIncident,
  GuardrailTrip,
} from "@/domain/intelligence/guardrail";

/**
 * The self-improving guardrail loop, app side. When a model output trips a safety
 * guard and the system falls back, the adapter emits a trip; here we hash the
 * offending sample (never store the raw text), stamp it with the current rule
 * version, and keep it in a bounded incident log. A reviewer or agent reads the
 * log and PROMOTES a real miss into a learned rule (learnDiagnosticPattern), which
 * immediately strengthens the guard everywhere and bumps the version — so the same
 * gap can never reopen. That is the agentic improvement: observe → promote →
 * permanent, without a model ever mutating a safety rule directly.
 */

const MAX_INCIDENTS = 500;
const incidents: GuardrailIncident[] = [];

/** Combined rule version string, e.g. "1.0.0+2" (base lexicon + learned count). */
export function guardrailRuleVersion(): string {
  return `${NON_DIAGNOSTIC_LEXICON_VERSION}+${learnedGuardVersion()}`;
}

function hashSample(sample: string): string {
  return createHash("sha256").update(sample).digest("hex").slice(0, 16);
}

/** Record one guardrail trip (called from the LLM adapter via buildIntelligence). */
export function recordGuardrailTrip(trip: GuardrailTrip, at: Date): void {
  incidents.push({
    guard: trip.guard,
    ruleVersion: guardrailRuleVersion(),
    matched: trip.matched,
    sampleHash: hashSample(trip.sample),
    at,
  });
  if (incidents.length > MAX_INCIDENTS) incidents.shift();
}

export interface GuardrailStatus {
  ruleVersion: string;
  totalIncidents: number;
  byGuard: Record<string, number>;
  learnedRules: readonly string[];
  recent: GuardrailIncident[];
}

/** A snapshot for an operator/audit surface — the health of the loop. */
export function guardrailStatus(): GuardrailStatus {
  const byGuard: Record<string, number> = {};
  for (const i of incidents) byGuard[i.guard] = (byGuard[i.guard] ?? 0) + 1;
  return {
    ruleVersion: guardrailRuleVersion(),
    totalIncidents: incidents.length,
    byGuard,
    learnedRules: learnedGuardSummary(),
    recent: incidents.slice(-20),
  };
}

/**
 * Promote a reviewed miss into a permanent learned rule. `source` is a regex the
 * base lexicon lacked; adding it strengthens the non-diagnostic guard everywhere
 * and bumps the version. Ship a regression test alongside every call.
 */
export function promoteGuardrailRule(source: string, note: string): void {
  learnDiagnosticPattern(source, note);
}
