import { describe, expect, it } from "vitest";

import {
  EVIDENCE_SCHEMA_VERSION,
  UnconfirmedFieldMapError,
  receiveCanonical,
  type Id,
  type ProviderCapabilities,
} from "@/domain";
import type { EvidenceProvider } from "@/domain/ports";

/**
 * The EvidenceProvider conformance suite — the ONE contract every adapter must
 * pass to be interchangeable, decoupled from any vendor's shape. Running it over
 * two providers with different shapes/capabilities is the proof that the domain
 * is untouched across both (CLAUDE.md → Architecture: new provider, zero domain
 * change).
 *
 * The provider supplies its own fixtures because native shapes differ; the suite
 * asserts the shared behavior: capability honesty, current-version output,
 * idempotency, malformed-row quarantine, and refusal under an unconfirmed map.
 */
export interface ProviderContract {
  name: string;
  capabilities: ProviderCapabilities;
  /** A student the fixtures have rows for. */
  studentId: Id;
  /** A student the fixtures have NO rows for. */
  emptyStudentId: Id;
  /** How many well-formed rows `makeConfirmed` emits for `studentId`. */
  validCount: number;
  /** Provider with a CONFIRMED field map over well-formed rows. */
  makeConfirmed: () => EvidenceProvider;
  /** The SAME provider under a PROPOSED (unconfirmed) field map. */
  makeProposed: () => EvidenceProvider;
  /** Provider whose native rows include exactly one malformed row. */
  makeWithMalformedRow: () => EvidenceProvider;
}

export function defineProviderContract(contract: ProviderContract): void {
  const { capabilities: caps } = contract;

  describe(`${contract.name} — EvidenceProvider contract`, () => {
    it("declares its capabilities as the interface expects", () => {
      expect(contract.makeConfirmed().capabilities()).toEqual(caps);
    });

    it("refuses to pull under a 'proposed' (unconfirmed) field map", async () => {
      await expect(
        contract.makeProposed().pull(contract.studentId),
      ).rejects.toBeInstanceOf(UnconfirmedFieldMapError);
    });

    it("pulls under a 'confirmed' field map", async () => {
      const evidence = await contract.makeConfirmed().pull(contract.studentId);
      expect(evidence).toHaveLength(contract.validCount);
      expect(evidence.every((e) => e.studentId === contract.studentId)).toBe(true);
    });

    it("returns [] for a student it has no rows for", async () => {
      expect(
        await contract.makeConfirmed().pull(contract.emptyStudentId),
      ).toEqual([]);
    });

    it("emits only current-schema-version canonical evidence", async () => {
      const evidence = await contract.makeConfirmed().pull(contract.studentId);
      expect(
        evidence.every((e) => e.schemaVersion === EVIDENCE_SCHEMA_VERSION),
      ).toBe(true);
    });

    it("emits evidence that re-validates through the canonical gate", async () => {
      const evidence = await contract.makeConfirmed().pull(contract.studentId);
      for (const e of evidence) {
        expect(receiveCanonical(e).ok).toBe(true);
      }
    });

    it("declares capabilities HONESTLY — flags are an upper bound on the data", async () => {
      const evidence = await contract.makeConfirmed().pull(contract.studentId);

      if (!caps.itemLevel) {
        expect(evidence.every((e) => (e.items?.length ?? 0) === 0)).toBe(true);
      } else {
        expect(evidence.some((e) => (e.items?.length ?? 0) > 0)).toBe(true);
      }

      if (!caps.skillTags) {
        expect(
          evidence.every((e) => (e.items ?? []).every((i) => i.skillTag === undefined)),
        ).toBe(true);
      } else {
        expect(
          evidence.some((e) => (e.items ?? []).some((i) => i.skillTag !== undefined)),
        ).toBe(true);
      }

      if (!caps.attendance) {
        expect(evidence.every((e) => e.attendance === undefined)).toBe(true);
      } else {
        expect(evidence.some((e) => e.attendance !== undefined)).toBe(true);
      }
    });

    it("is idempotent: two pulls return deeply-equal results", async () => {
      const provider = contract.makeConfirmed();
      const first = await provider.pull(contract.studentId);
      const second = await provider.pull(contract.studentId);
      expect(first).toEqual(second);
    });

    it("quarantines a malformed native row (survivors are valid, count drops)", async () => {
      const evidence = await contract
        .makeWithMalformedRow()
        .pull(contract.studentId);
      // The malformed row is absent; the well-formed ones survive intact.
      expect(evidence).toHaveLength(contract.validCount);
      for (const e of evidence) {
        expect(receiveCanonical(e).ok).toBe(true);
      }
    });
  });
}
