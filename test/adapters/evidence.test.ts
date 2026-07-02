import { describe, expect, it } from "vitest";

import { UNTAGGED_SKILL_ID } from "@/domain";
import type { RawGradeRecord } from "@/domain/ports";
import {
  createMockEvidenceSource,
  evidenceOutcomeId,
  normalizeRecords,
} from "@/adapters/evidence";
import { defineEvidenceSourceContract } from "../support/evidenceSourceContract";

// The port contract, run against the only implementation that exists.
defineEvidenceSourceContract({
  name: "MockEvidenceSource",
  makeSource: (records) => createMockEvidenceSource(records),
});

describe("MockEvidenceSource", () => {
  it("delivers records added after construction (a revised grade arriving late)", async () => {
    const source = createMockEvidenceSource([]);
    expect(await source.pull("stu-1")).toEqual([]);

    const revised: RawGradeRecord = {
      studentId: "stu-1",
      assessmentRef: "assess-a",
      recordedAt: "2026-01-02T10:00:00.000Z",
      revision: 2,
      totalScore: 4,
      totalMax: 4,
    };
    source.add(revised);
    expect(await source.pull("stu-1")).toEqual([revised]);
  });
});

describe("normalizeRecords", () => {
  const RECORDED = "2026-01-01T12:00:00.000Z";

  const itemLevelRecord = (
    overrides: Partial<RawGradeRecord> = {},
  ): RawGradeRecord => ({
    externalId: "gb-1",
    studentId: "stu-1",
    assessmentRef: "assess-a",
    recordedAt: RECORDED,
    items: [
      { itemRef: "item-1", skillTag: "skill-x", correct: true, maxPoints: 1 },
      { itemRef: "item-2", skillTag: "skill-y", correct: false, maxPoints: 1 },
    ],
    ...overrides,
  });

  it("normalizes an item-level record into Assessment + items + Outcome with deterministic ids", () => {
    const { normalized, quarantined } = normalizeRecords([itemLevelRecord()]);

    expect(quarantined).toEqual([]);
    expect(normalized).toHaveLength(1);
    const ev = normalized[0];
    expect(ev.assessment.id).toBe("assess-a");
    expect(ev.outcome.id).toBe(evidenceOutcomeId("assess-a", "stu-1"));
    expect(ev.items.map((i) => i.skillId)).toEqual(["skill-x", "skill-y"]);
    expect(ev.outcome.itemOutcomes).toEqual([
      { itemId: "item-1", correct: true, pointsAwarded: 1 },
      { itemId: "item-2", correct: false, pointsAwarded: 0 },
    ]);
  });

  it("quarantines a malformed row with a reason and keeps normalizing the rest", () => {
    const malformed: RawGradeRecord = {
      studentId: "stu-1",
      assessmentRef: "assess-bad",
      recordedAt: "last tuesday",
      totalScore: 7,
      totalMax: 10,
    };
    const { normalized, quarantined } = normalizeRecords([
      malformed,
      itemLevelRecord(),
    ]);

    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].record).toBe(malformed);
    expect(quarantined[0].reason).toContain("not a parseable date");
    expect(normalized).toHaveLength(1);
    expect(normalized[0].assessment.id).toBe("assess-a");
  });

  it("quarantines a record with neither item detail nor an assignment total", () => {
    const { normalized, quarantined } = normalizeRecords([
      { studentId: "stu-1", assessmentRef: "assess-a", recordedAt: RECORDED },
    ]);
    expect(normalized).toEqual([]);
    expect(quarantined[0].reason).toContain(
      "neither item detail nor an assignment total",
    );
  });

  it("quarantines missing studentId and totalScore > totalMax", () => {
    const { quarantined } = normalizeRecords([
      { assessmentRef: "assess-a", recordedAt: RECORDED, totalScore: 1, totalMax: 2 },
      {
        studentId: "stu-1",
        assessmentRef: "assess-a",
        recordedAt: RECORDED,
        totalScore: 11,
        totalMax: 10,
      },
    ]);
    expect(quarantined).toHaveLength(2);
    expect(quarantined[0].reason).toContain("studentId");
    expect(quarantined[1].reason).toContain("totalScore exceeds totalMax");
  });

  it("keeps a total-only row as evidence with no items", () => {
    const { normalized } = normalizeRecords([
      {
        studentId: "stu-1",
        assessmentRef: "assess-a",
        recordedAt: RECORDED,
        totalScore: 13,
        totalMax: 20,
      },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].items).toEqual([]);
    expect(normalized[0].outcome.itemOutcomes).toEqual([]);
    expect(normalized[0].totals).toEqual({ pointsAwarded: 13, maxPoints: 20 });
  });

  it("derives correctness from points (full credit = correct) and synthesizes missing itemRefs", () => {
    const { normalized } = normalizeRecords([
      itemLevelRecord({
        items: [
          { pointsAwarded: 2, maxPoints: 2 },
          { pointsAwarded: 1, maxPoints: 2 },
        ],
      }),
    ]);
    const ev = normalized[0];
    expect(ev.outcome.itemOutcomes).toEqual([
      { itemId: "assess-a:item-1", correct: true, pointsAwarded: 2 },
      { itemId: "assess-a:item-2", correct: false, pointsAwarded: 1 },
    ]);
    expect(ev.notes.some((n) => n.includes("synthesized"))).toBe(true);
  });

  it("degrades a partial row (unusable item detail) to its assignment total, with a note", () => {
    const { normalized, quarantined } = normalizeRecords([
      itemLevelRecord({
        items: [{ itemRef: "item-1" }], // no correctness, no points
        totalScore: 3,
        totalMax: 4,
      }),
    ]);
    expect(quarantined).toEqual([]);
    const ev = normalized[0];
    expect(ev.outcome.itemOutcomes).toEqual([]);
    expect(ev.totals).toEqual({ pointsAwarded: 3, maxPoints: 4 });
    expect(ev.notes.some((n) => n.includes("degraded to assignment total"))).toBe(
      true,
    );
  });

  it("zero tags: untagged items get the UNTAGGED sentinel (passthrough default, no tagger)", () => {
    const { normalized } = normalizeRecords([
      itemLevelRecord({
        items: [{ itemRef: "item-1", correct: true }],
      }),
    ]);
    expect(normalized[0].items[0].skillId).toBe(UNTAGGED_SKILL_ID);
  });

  it("an optional tagger enriches untagged items from their prompts, deterministically", () => {
    const record = itemLevelRecord({
      items: [
        { itemRef: "item-1", correct: true, prompt: "Find the slope of the line." },
        { itemRef: "item-2", correct: false, prompt: "No hints here." },
      ],
    });
    const tagger = (prompt: string): string | null =>
      prompt.toLowerCase().includes("slope") ? "skill-slope" : null;

    const { normalized } = normalizeRecords([record], { tagger });
    expect(normalized[0].items.map((i) => i.skillId)).toEqual([
      "skill-slope",
      UNTAGGED_SKILL_ID,
    ]);
  });

  it("orders normalized evidence by recordedAt then revision, so revisions apply last", () => {
    const rev2 = itemLevelRecord({
      recordedAt: "2026-01-01T15:00:00.000Z",
      revision: 2,
    });
    const rev1 = itemLevelRecord({ revision: 1 });
    const { normalized } = normalizeRecords([rev2, rev1]);
    expect(normalized.map((e) => e.revision)).toEqual([1, 2]);
  });
});
