import { DomainError, type Id } from "@/domain";
import type { EvidenceProvider, ProviderRegistry } from "@/domain/ports";

/**
 * In-memory ProviderRegistry — register adapters by id, select one at runtime.
 * The application holds only the ProviderRegistry interface, so swapping which
 * provider is selected never touches domain or service code.
 */
export function createProviderRegistry(): ProviderRegistry {
  const byId = new Map<Id, EvidenceProvider>();
  return {
    register(provider) {
      byId.set(provider.id, provider);
    },
    select(id) {
      const provider = byId.get(id);
      if (provider === undefined) {
        throw new DomainError(`no evidence provider registered with id ${id}`);
      }
      return provider;
    },
    ids() {
      return [...byId.keys()];
    },
  };
}
