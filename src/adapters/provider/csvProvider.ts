import {
  EVIDENCE_SCHEMA_VERSION,
  assertFieldMapUsable,
  receiveCanonical,
  remap,
  type CanonicalEvidence,
  type FieldMap,
  type Id,
  type ProviderCapabilities,
} from "@/domain";
import type { EvidenceProvider } from "@/domain/ports";
import { parseCsv } from "./csv";

/**
 * CsvEvidenceProvider — the FIRST real EvidenceProvider (P15). CSV is the
 * universal SIS fallback: every SIS exports it, so the pilot never blocks on API
 * negotiation. It ingests a generic gradebook export OR a OneRoster CSV bundle
 * through the SAME P8 machinery: refuse under an unconfirmed field map, remap
 * native columns to canonical fields, and validate through `receiveCanonical` so
 * a malformed row is QUARANTINED, never silently dropped.
 *
 * Honesty of capabilities: total-level only unless the export actually carries
 * item columns; skill tags only when tagged. The pilot path is total-level, so
 * capabilities are declared accordingly and the eligibility gate (P6) bounds what
 * may be computed.
 */

export const CSV_PROVIDER_ID = "provider-csv";

/** Canonical fields that must be numbers; CSV delivers strings. */
const NUMERIC_FIELDS = new Set(["totalScore", "totalMax", "revision"]);

/**
 * Coerce mapped numeric fields from strings to numbers. A value that does not
 * parse to a finite number is left AS THE STRING so the canonical validator
 * rejects it — that is exactly how a malformed row gets quarantined, not dropped.
 */
function coerceNumbers(
  mapped: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...mapped };
  for (const key of NUMERIC_FIELDS) {
    if (typeof out[key] === "string") {
      const n = Number(out[key]);
      if (out[key] !== "" && Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}

export interface CsvProviderOptions {
  id?: Id;
  /** Native rows (already parsed from CSV), keyed by native column name. */
  rows: readonly Record<string, string>[];
  fieldMap: FieldMap;
  capabilities: ProviderCapabilities;
}

/** Translate one native row to canonical, or a reason string if it can't. */
function translateRow(
  row: Record<string, string>,
  fieldMap: FieldMap,
): { ok: true; evidence: CanonicalEvidence } | { ok: false; reason: string } {
  const mapped = coerceNumbers(remap(row, fieldMap.mappings));
  const result = receiveCanonical({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ...mapped,
  });
  return result.ok
    ? { ok: true, evidence: result.evidence }
    : { ok: false, reason: result.reason };
}

export function createCsvEvidenceProvider(
  opts: CsvProviderOptions,
): EvidenceProvider {
  const { rows, fieldMap, capabilities } = opts;
  const id = opts.id ?? CSV_PROVIDER_ID;
  const studentKey = Object.entries(fieldMap.mappings).find(
    ([, to]) => to === "studentId",
  )?.[0];

  return {
    id,
    capabilities: () => capabilities,
    async pull(studentId) {
      assertFieldMapUsable(fieldMap);
      const out: CanonicalEvidence[] = [];
      for (const row of rows) {
        if (studentKey !== undefined && row[studentKey] !== studentId) continue;
        const translated = translateRow(row, fieldMap);
        if (translated.ok) out.push(translated.evidence); // else: quarantined
      }
      return out;
    },
  };
}

// --- Ingestion report (for the operator route) -------------------------------

export interface IngestedRow {
  evidence: CanonicalEvidence;
}

export interface QuarantinedRow {
  /** 1-based row number in the source file, for the uploader to locate it. */
  line: number;
  reason: string;
  raw: Record<string, string>;
}

export interface CsvIngestionReport {
  accepted: CanonicalEvidence[];
  quarantined: QuarantinedRow[];
  totalRows: number;
}

/**
 * Build the row-level ingestion report the operator sees: which rows normalized
 * and which were quarantined and WHY. Refuses under an unconfirmed field map (the
 * P8 rule, re-asserted through this path). This surfaces reasons to the uploader;
 * it never drops a bad row silently.
 */
export function buildCsvIngestionReport(
  rows: readonly Record<string, string>[],
  fieldMap: FieldMap,
): CsvIngestionReport {
  assertFieldMapUsable(fieldMap);
  const accepted: CanonicalEvidence[] = [];
  const quarantined: QuarantinedRow[] = [];
  rows.forEach((row, i) => {
    const translated = translateRow(row, fieldMap);
    if (translated.ok) accepted.push(translated.evidence);
    else quarantined.push({ line: i + 2, reason: translated.reason, raw: row }); // +2: header is line 1
  });
  return { accepted, quarantined, totalRows: rows.length };
}

// --- Generic gradebook export ------------------------------------------------

/**
 * A field map for a generic gradebook CSV. The caller confirms it; nothing is
 * auto-applied. `columns` maps native header names to canonical field names.
 */
export function csvGradebookFieldMap(
  columns: Record<string, string>,
  status: FieldMap["status"] = "confirmed",
): FieldMap {
  return { providerId: CSV_PROVIDER_ID, mappings: columns, status };
}

// --- OneRoster CSV bundle ----------------------------------------------------

export const ONEROSTER_PROVIDER_ID = "provider-oneroster-csv";

/**
 * The OneRoster field map over the flattened result rows the bundle join emits.
 * (OneRoster splits a grade across results.csv + lineItems.csv; we join them into
 * one native row first, then map here.)
 */
export function oneRosterFieldMap(
  status: FieldMap["status"] = "confirmed",
): FieldMap {
  return {
    providerId: ONEROSTER_PROVIDER_ID,
    mappings: {
      studentSourcedId: "studentId",
      lineItemSourcedId: "assessmentRef",
      lineItemTitle: "assessmentTitle",
      score: "totalScore",
      resultMax: "totalMax",
      scoreDate: "recordedAt",
      scoreStatus: "status",
    },
    status,
  };
}

export interface OneRosterBundle {
  /** results.csv text (sourcedId, studentSourcedId, lineItemSourcedId, score, scoreDate, scoreStatus, …). */
  results: string;
  /** lineItems.csv text (sourcedId, title, resultValueMax, …). */
  lineItems: string;
}

/**
 * Join a OneRoster CSV bundle into flat native rows (one per result), pulling the
 * line item's title and max score onto each result. A result whose line item is
 * missing keeps an empty max, so it quarantines downstream rather than inventing
 * a total — honest failure over a fabricated denominator.
 */
export function parseOneRosterBundle(
  bundle: OneRosterBundle,
): Record<string, string>[] {
  const items = parseCsv(bundle.lineItems);
  const byId = new Map<string, { title: string; max: string }>();
  for (const item of items.rows) {
    byId.set(item.sourcedId, {
      title: item.title ?? "",
      max: item.resultValueMax ?? "",
    });
  }

  const results = parseCsv(bundle.results);
  return results.rows.map((r) => {
    const item = byId.get(r.lineItemSourcedId);
    return {
      studentSourcedId: r.studentSourcedId ?? "",
      lineItemSourcedId: r.lineItemSourcedId ?? "",
      lineItemTitle: item?.title ?? "",
      score: r.score ?? "",
      resultMax: item?.max ?? "",
      scoreDate: r.scoreDate ?? "",
      scoreStatus: r.scoreStatus ?? "",
    };
  });
}

/** Total-level CSV: no item detail, no skill tags, no attendance. */
export const CSV_TOTAL_ONLY_CAPABILITIES: ProviderCapabilities = {
  itemLevel: false,
  skillTags: false,
  attendance: false,
};
