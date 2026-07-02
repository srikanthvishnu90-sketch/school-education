import type { Id } from "@/domain";
import type { EvidenceSource, RawGradeRecord } from "@/domain/ports";

/**
 * MockEvidenceSource — the only EvidenceSource implementation pre-infra. It is
 * a delivery mechanism for MESSY rows (assignment-level totals, missing skill
 * tags, revised/late grades, partial and malformed rows), not a cleaner: it
 * hands records through verbatim and leaves validation to the normalizer.
 * `add` lets tests and compositions emit late rows (e.g. a revised grade).
 */
export interface MockEvidenceSource extends EvidenceSource {
  add(...records: RawGradeRecord[]): void;
}

export function createMockEvidenceSource(
  initial: readonly RawGradeRecord[] = [],
): MockEvidenceSource {
  const records: RawGradeRecord[] = [...initial];

  return {
    add(...more: RawGradeRecord[]): void {
      records.push(...more);
    },

    async pull(studentId: Id, since?: Date): Promise<RawGradeRecord[]> {
      return records.filter((record) => {
        if (record.studentId !== studentId) return false;
        if (since === undefined) return true;
        const at =
          record.recordedAt instanceof Date
            ? record.recordedAt
            : new Date(record.recordedAt ?? Number.NaN);
        // An unparseable recordedAt cannot be honestly excluded by `since`;
        // it is returned and the normalizer quarantines it with a reason.
        return Number.isNaN(at.getTime()) || at.getTime() > since.getTime();
      });
    },
  };
}
