"use server";

import {
  buildCsvIngestionReport,
  oneRosterFieldMap,
  parseOneRosterBundle,
} from "@/adapters/provider";
import { getSessionUser } from "./session";
import { getWorld } from "./world";

/**
 * The operator ingestion action — the ONLY way a gradebook export enters the
 * system (P15). Authed to the teacher/operator role (P12); the client never
 * names who it is. It parses a OneRoster CSV bundle, normalizes through the P8
 * confirmed-field-map path, and returns a ROW-LEVEL report: what was accepted and
 * which rows were quarantined and why. Malformed rows are reported, never dropped.
 *
 * This surface concerns EVIDENCE rows only. It never touches, computes, or
 * reveals response-quality (honesty) signals — those are never surfaced anywhere.
 */

export interface IngestReport {
  ok: boolean;
  error?: string;
  totalRows: number;
  acceptedCount: number;
  /** Canonical assessmentRef + student for a few accepted rows (operator sanity). */
  acceptedSample: { studentId: string; assessmentRef: string }[];
  quarantined: { line: number; reason: string }[];
}

const EMPTY: IngestReport = {
  ok: false,
  totalRows: 0,
  acceptedCount: 0,
  acceptedSample: [],
  quarantined: [],
};

export async function ingestOneRoster(
  _prev: IngestReport | null,
  formData: FormData,
): Promise<IngestReport> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") {
    return { ...EMPTY, error: "Only an operator can import evidence." };
  }

  const results = String(formData.get("results") ?? "").trim();
  const lineItems = String(formData.get("lineItems") ?? "").trim();
  if (results.length === 0 || lineItems.length === 0) {
    return { ...EMPTY, error: "Paste both the results and line-items exports." };
  }

  try {
    const rows = parseOneRosterBundle({ results, lineItems });
    // The OneRoster preset is a CONFIRMED map (the operator chose this format);
    // an unconfirmed map would refuse here (P8), re-asserted by the provider path.
    const report = buildCsvIngestionReport(rows, oneRosterFieldMap("confirmed"));

    // Persist accepted grades so the student can see their own record (p7).
    const world = await getWorld();
    await world.importedGrades.add(report.accepted);

    return {
      ok: true,
      totalRows: report.totalRows,
      acceptedCount: report.accepted.length,
      acceptedSample: report.accepted.slice(0, 5).map((e) => ({
        studentId: e.studentId,
        assessmentRef: e.assessmentRef,
      })),
      quarantined: report.quarantined.map((q) => ({
        line: q.line,
        reason: q.reason,
      })),
    };
  } catch (err) {
    return {
      ...EMPTY,
      error: err instanceof Error ? err.message : "Could not read the export.",
    };
  }
}
