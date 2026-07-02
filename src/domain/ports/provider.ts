import type { Id } from "../common";
import type { CanonicalEvidence, ProviderCapabilities } from "../evidence";

/**
 * EvidenceProvider — the generalized driven port evidence walks in through. It
 * replaces the single-source EvidenceSource with a family of interchangeable
 * adapters, each a thin translator from one vendor's native shape into the ONE
 * canonical evidence language. The application depends on this interface only;
 * a new SIS/LMS is a new adapter, never a domain change (CLAUDE.md → Architecture).
 *
 * `capabilities()` DECLARES what the provider supplies, which bounds what the P6
 * eligibility gate may compute. `pull()` returns canonical evidence and REFUSES
 * (throws) when its field map is not yet confirmed.
 */
export interface EvidenceProvider {
  readonly id: Id;
  capabilities(): ProviderCapabilities;
  pull(studentId: Id, since?: Date): Promise<CanonicalEvidence[]>;
}

/**
 * The registry the application selects a provider from at runtime. Register many
 * adapters; the rest of the system holds only this interface.
 */
export interface ProviderRegistry {
  register(provider: EvidenceProvider): void;
  /** The provider with this id; throws if none is registered. */
  select(id: Id): EvidenceProvider;
  /** Registered provider ids, in registration order. */
  ids(): Id[];
}
