import { describe, expect, it } from "vitest";

import {
  createTotalOnlyMockProvider,
  ledgerFieldMap,
  LEDGER_PROVIDER_ID,
  type LedgerRow,
} from "@/adapters/provider";
import { defineProviderContract } from "../../support/providerContract";

/**
 * Provider B: LedgerLMS — a total-only source that also carries attendance and
 * no skill tags. Same contract as QuizWorld, entirely different shape and
 * capabilities: the proof the domain speaks one language across both.
 */

const GOOD_ROWS: LedgerRow[] = [
  {
    sid: "stu-1",
    course: "hw-1",
    label: "Homework 1",
    recorded: "2026-01-05T09:00:00.000Z",
    earned: 8,
    possible: 10,
    attended: true,
    tardyMinutes: 0,
  },
  {
    sid: "stu-1",
    course: "hw-2",
    recorded: "2026-01-08T09:00:00.000Z",
    earned: 5,
    possible: 10,
    attended: false,
  },
  {
    sid: "stu-2",
    course: "hw-1",
    recorded: "2026-01-05T09:00:00.000Z",
    earned: 9,
    possible: 10,
    attended: true,
  },
];

/** A stu-1 row with an empty course — the canonical assessmentRef is unusable. */
const MALFORMED_ROW: LedgerRow = {
  sid: "stu-1",
  course: "",
  recorded: "2026-01-09T09:00:00.000Z",
  earned: 7,
  possible: 10,
  attended: true,
};

defineProviderContract({
  name: "LedgerLMS",
  capabilities: { itemLevel: false, skillTags: false, attendance: true },
  studentId: "stu-1",
  emptyStudentId: "stu-none",
  validCount: 2,
  makeConfirmed: () =>
    createTotalOnlyMockProvider({ rows: GOOD_ROWS, fieldMap: ledgerFieldMap() }),
  makeProposed: () =>
    createTotalOnlyMockProvider({
      rows: GOOD_ROWS,
      fieldMap: ledgerFieldMap("proposed"),
    }),
  makeWithMalformedRow: () =>
    createTotalOnlyMockProvider({
      rows: [...GOOD_ROWS, MALFORMED_ROW],
      fieldMap: ledgerFieldMap(),
    }),
});

describe("LedgerLMS — native → canonical translation", () => {
  it("maps totals + attendance and emits NO item detail", async () => {
    const provider = createTotalOnlyMockProvider({
      rows: GOOD_ROWS,
      fieldMap: ledgerFieldMap(),
    });
    const [first] = await provider.pull("stu-1");

    expect(first.studentId).toBe("stu-1");
    expect(first.assessmentRef).toBe("hw-1");
    expect(first.assessmentTitle).toBe("Homework 1");
    expect(first.totalScore).toBe(8);
    expect(first.totalMax).toBe(10);
    expect(first.items).toBeUndefined();
    expect(first.attendance).toEqual({ present: true, minutesLate: 0 });
  });

  it("carries a stable provider id", () => {
    const provider = createTotalOnlyMockProvider({
      rows: [],
      fieldMap: ledgerFieldMap(),
    });
    expect(provider.id).toBe(LEDGER_PROVIDER_ID);
  });
});
