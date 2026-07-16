/**
 * A guardrail incident: the record left behind when a model output fails a safety
 * guard and the system falls back to the deterministic path. Incidents are the
 * LEARNING SIGNAL of the self-improving loop — they say WHICH guard tripped and on
 * WHAT (as a non-reversible hash, never the raw student/teacher text), so a
 * reviewer or agent can promote a real miss into a learned rule (learnedGuards).
 *
 * The type lives in the pure domain so the adapter (which detects the trip) and
 * the app (which records + reviews it) share one shape.
 */

export type GuardName =
  | "analysis_non_diagnostic"
  | "question_contract"
  | "signals_off_schema"
  | "summary_non_diagnostic";

export interface GuardrailIncident {
  guard: GuardName;
  /** Rule version at the time, e.g. "1.0.0+2" (base lexicon + learned count). */
  ruleVersion: string;
  /** Reasons/phrases matched, when the guard surfaces them. */
  matched: string[];
  /** SHA-256 (hex, truncated) of the offending sample — never the raw text. */
  sampleHash: string;
  at: Date;
}

/** What the adapter emits at a guardrail trip; the recorder hashes + stamps it. */
export interface GuardrailTrip {
  guard: GuardName;
  matched: string[];
  /** The offending text; hashed by the recorder and then discarded. */
  sample: string;
}

/** The sink the LLM adapter calls on a guardrail-forced fallback. */
export type GuardrailRecorder = (trip: GuardrailTrip) => void;
