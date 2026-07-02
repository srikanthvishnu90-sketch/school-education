import { describe, expect, it } from "vitest";

import type { EvidenceSource, RawGradeRecord } from "@/domain/ports";

/**
 * A reusable EvidenceSource contract — the port's expected behavior, decoupled
 * from any implementation. Today only MockEvidenceSource runs it; a future
 * LMS/SIS adapter must pass the exact same suite to be interchangeable.
 */
export interface EvidenceSourceContract {
  name: string;
  /** Builds a source pre-loaded with the given records. */
  makeSource: (records: readonly RawGradeRecord[]) => EvidenceSource;
}

function row(
  studentId: string,
  assessmentRef: string,
  recordedAt: string | Date,
): RawGradeRecord {
  return { studentId, assessmentRef, recordedAt, totalScore: 3, totalMax: 4 };
}

export function defineEvidenceSourceContract(
  contract: EvidenceSourceContract,
): void {
  describe(`${contract.name} — EvidenceSource contract`, () => {
    const early = row("stu-1", "assess-a", "2026-01-01T10:00:00.000Z");
    const late = row("stu-1", "assess-b", "2026-01-02T10:00:00.000Z");
    const other = row("stu-2", "assess-a", "2026-01-01T10:00:00.000Z");

    it("returns only the requested student's records", async () => {
      const source = contract.makeSource([early, late, other]);
      const pulled = await source.pull("stu-1");
      expect(pulled).toHaveLength(2);
      expect(pulled.every((r) => r.studentId === "stu-1")).toBe(true);
    });

    it("returns [] for a student with no records", async () => {
      const source = contract.makeSource([early, other]);
      expect(await source.pull("stu-none")).toEqual([]);
    });

    it("with `since`, returns only records recorded strictly after it", async () => {
      const source = contract.makeSource([early, late]);
      const pulled = await source.pull(
        "stu-1",
        new Date("2026-01-01T10:00:00.000Z"),
      );
      expect(pulled).toHaveLength(1);
      expect(pulled[0].assessmentRef).toBe("assess-b");
    });

    it("never drops a record whose recordedAt cannot be parsed (the normalizer decides its fate)", async () => {
      const unparseable = row("stu-1", "assess-c", "last tuesday");
      const source = contract.makeSource([early, unparseable]);
      const pulled = await source.pull(
        "stu-1",
        new Date("2026-06-01T00:00:00.000Z"),
      );
      expect(pulled).toHaveLength(1);
      expect(pulled[0].assessmentRef).toBe("assess-c");
    });
  });
}
