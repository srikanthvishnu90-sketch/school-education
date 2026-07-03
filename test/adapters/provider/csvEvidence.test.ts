import { describe, expect, it } from "vitest";

import {
  CSV_TOTAL_ONLY_CAPABILITIES,
  buildCsvIngestionReport,
  createCsvEvidenceProvider,
  oneRosterFieldMap,
  parseOneRosterBundle,
} from "@/adapters/provider";
import { UnconfirmedFieldMapError } from "@/domain";
import { evaluateCanonical } from "@/application";
import { defineProviderContract } from "../../support/providerContract";

/**
 * The first REAL EvidenceProvider (P15): a OneRoster CSV bundle flows through the
 * same P8 contract as the mocks, quarantines malformed rows with row-level
 * reasons, is idempotent, and reaches the P6 eligibility gate end to end.
 */

const LINE_ITEMS = `sourcedId,title,resultValueMax
li-1,Quiz 1,10
li-2,Quiz 2,20`;

const RESULTS_GOOD = `sourcedId,studentSourcedId,lineItemSourcedId,score,scoreDate,scoreStatus
r1,stu-1,li-1,8,2026-01-05T09:00:00.000Z,Submitted
r2,stu-1,li-2,15,2026-01-08T09:00:00.000Z,Submitted
r3,stu-2,li-1,9,2026-01-05T09:00:00.000Z,Submitted`;

// One stu-1 row whose score is non-numeric — the canonical totalScore can't form.
const RESULTS_WITH_MALFORMED = `${RESULTS_GOOD}
r4,stu-1,li-1,absent,2026-01-09T09:00:00.000Z,Submitted`;

const goodRows = (): Record<string, string>[] =>
  parseOneRosterBundle({ results: RESULTS_GOOD, lineItems: LINE_ITEMS });

defineProviderContract({
  name: "OneRoster-CSV",
  capabilities: CSV_TOTAL_ONLY_CAPABILITIES,
  studentId: "stu-1",
  emptyStudentId: "stu-none",
  validCount: 2,
  makeConfirmed: () =>
    createCsvEvidenceProvider({
      rows: goodRows(),
      fieldMap: oneRosterFieldMap("confirmed"),
      capabilities: CSV_TOTAL_ONLY_CAPABILITIES,
    }),
  makeProposed: () =>
    createCsvEvidenceProvider({
      rows: goodRows(),
      fieldMap: oneRosterFieldMap("proposed"),
      capabilities: CSV_TOTAL_ONLY_CAPABILITIES,
    }),
  makeWithMalformedRow: () =>
    createCsvEvidenceProvider({
      rows: parseOneRosterBundle({
        results: RESULTS_WITH_MALFORMED,
        lineItems: LINE_ITEMS,
      }),
      fieldMap: oneRosterFieldMap("confirmed"),
      capabilities: CSV_TOTAL_ONLY_CAPABILITIES,
    }),
});

describe("CSV ingestion report", () => {
  it("refuses under an unconfirmed (proposed) field map (P8 rule)", () => {
    expect(() =>
      buildCsvIngestionReport(goodRows(), oneRosterFieldMap("proposed")),
    ).toThrow(UnconfirmedFieldMapError);
  });

  it("reports malformed rows with a reason and line number — never silently drops", () => {
    const rows = parseOneRosterBundle({
      results: RESULTS_WITH_MALFORMED,
      lineItems: LINE_ITEMS,
    });
    const report = buildCsvIngestionReport(rows, oneRosterFieldMap("confirmed"));
    expect(report.accepted).toHaveLength(3); // r1, r2, r3
    expect(report.quarantined).toHaveLength(1); // r4
    expect(report.quarantined[0].line).toBe(5); // header=1, r1=2 … r4=5
    expect(report.quarantined[0].reason).toMatch(/totalScore/i);
    expect(report.totalRows).toBe(4);
  });

  it("is idempotent: re-ingesting the same file yields the same accepted set", () => {
    const map = oneRosterFieldMap("confirmed");
    const a = buildCsvIngestionReport(goodRows(), map);
    const b = buildCsvIngestionReport(goodRows(), map);
    expect(a.accepted).toEqual(b.accepted);
  });
});

describe("end to end through the P6 eligibility gate", () => {
  it("a real OneRoster grade normalizes and is eligible for baseline evidence", async () => {
    const provider = createCsvEvidenceProvider({
      rows: goodRows(),
      fieldMap: oneRosterFieldMap("confirmed"),
      capabilities: CSV_TOTAL_ONLY_CAPABILITIES,
    });
    const evidence = await provider.pull("stu-1");
    expect(evidence.length).toBeGreaterThan(0);

    // No prediction → baseline evidence; the gate accepts a total-only grade.
    const result = evaluateCanonical(
      evidence[0],
      null,
      provider.capabilities(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluation.studentId).toBe("stu-1");
      expect(result.evaluation.eligibility).toBeDefined();
    }
  });
});
