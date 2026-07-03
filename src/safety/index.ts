/**
 * The safety module (P16). Deliberately ISOLATED: import this ONLY at a capture
 * boundary (where free text is submitted) and the counselor surface. The agent
 * policy, calibration, and all analytics must never import it — an isolation test
 * enforces that. A crisis is routed to humans; it is never data for a model.
 */
export * from "./lexicon";
export * from "./detector";
export * from "./escalation";
export * from "./ports";
export * from "./cipher";
export * from "./service";
export * from "./memory";
