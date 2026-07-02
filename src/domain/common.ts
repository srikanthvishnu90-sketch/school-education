/**
 * Shared value-object primitives for the plumb domain.
 *
 * These are the atoms every entity is built from. Ranges are enforced at the
 * boundary (Zod schemas + factories) so nothing downstream — calibration math
 * (P3), services, adapters — ever has to re-validate. See CLAUDE.md → Hard
 * guardrails ("prefer small, composable functions ... pure").
 */

/** Opaque identifier. Non-empty string; generation is an infrastructure concern. */
export type Id = string;

/** A probability / normalized score in the closed interval [0, 1]. */
export type UnitInterval = number;

/** Affective valence: unpleasant..pleasant in [-1, 1] (Barrett/Russell circumplex). */
export type Valence = number;

/** Affective arousal: low..high in [0, 1] (Barrett/Russell circumplex). */
export type Arousal = number;

/**
 * Raised when a domain invariant is violated. Distinct from a Zod schema error
 * (shape/range) so callers can tell a cross-field rule ("prediction must precede
 * outcome") apart from a malformed field.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
