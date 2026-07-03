import {
  UnconfirmedFieldMapError,
  receiveCanonical,
  type CanonicalEvidence,
  type FieldMap,
  type Id,
  type ProviderCapabilities,
} from "@/domain";
import type { Clock } from "@/domain/ports";
import type { EvidenceProvider } from "@/domain/ports";
import { DEFAULT_TENANT_ID, type SqlClient } from "./client";

/**
 * A Postgres-backed EvidenceProvider. Its native store IS the canonical evidence
 * table (rows already in the internal language), gated by a persisted field map:
 * pull refuses unless the map is CONFIRMED, and a row that fails the versioned
 * canonical gate is quarantined (dropped). This is the same EvidenceProvider
 * contract as the mocks, satisfied by a second, database-backed implementation.
 */

export function createPgEvidenceProvider(
  client: SqlClient,
  config: { providerId: Id; capabilities: ProviderCapabilities },
): EvidenceProvider {
  return {
    id: config.providerId,
    capabilities: () => config.capabilities,
    async pull(studentId, since) {
      const map = await client.query<{ status: string }>(
        "select status from academic.field_maps where provider_id = $1",
        [config.providerId],
      );
      const status = map.rows[0]?.status;
      if (status !== "confirmed") {
        throw new UnconfirmedFieldMapError(config.providerId);
      }

      const { rows } = await client.query<{ data: unknown }>(
        "select data from academic.canonical_evidence " +
          "where provider_id = $1 and student_id = $2 order by seq asc",
        [config.providerId, studentId],
      );

      const out: CanonicalEvidence[] = [];
      for (const row of rows) {
        const result = receiveCanonical(row.data);
        if (!result.ok) continue; // quarantine a foreign/malformed row
        if (since !== undefined) {
          const at = new Date(result.evidence.recordedAt);
          if (!(Number.isNaN(at.getTime()) || at.getTime() > since.getTime())) {
            continue;
          }
        }
        out.push(result.evidence);
      }
      return out;
    },
  };
}

export interface SeedProviderInput {
  providerId: Id;
  fieldMap: FieldMap;
  /** Canonical payloads (some may be intentionally malformed) per student. */
  rows: { studentId: Id; payload: unknown }[];
}

/** Seeds a provider's field map + canonical evidence rows (test fixtures). */
export async function seedPgProvider(
  client: SqlClient,
  clock: Clock,
  input: SeedProviderInput,
): Promise<void> {
  await client.query(
    "insert into academic.field_maps (provider_id, tenant_id, mappings, status, created_at) " +
      "values ($1, $2, $3, $4, $5) on conflict (provider_id) do update set " +
      "mappings = excluded.mappings, status = excluded.status, created_at = excluded.created_at",
    [
      input.providerId,
      DEFAULT_TENANT_ID,
      JSON.stringify(input.fieldMap.mappings),
      input.fieldMap.status,
      clock.now(),
    ],
  );

  for (let i = 0; i < input.rows.length; i += 1) {
    const { studentId, payload } = input.rows[i];
    const version =
      payload !== null &&
      typeof payload === "object" &&
      typeof (payload as { schemaVersion?: unknown }).schemaVersion === "number"
        ? (payload as { schemaVersion: number }).schemaVersion
        : -1;
    await client.query(
      "insert into academic.canonical_evidence " +
        "(id, tenant_id, provider_id, student_id, schema_version, data, created_at) " +
        "values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do update set data = excluded.data",
      [
        `${input.providerId}-ev-${i}`,
        DEFAULT_TENANT_ID,
        input.providerId,
        studentId,
        version,
        JSON.stringify(payload),
        clock.now(),
      ],
    );
  }
}
