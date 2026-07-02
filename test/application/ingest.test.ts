import { describe, expect, it } from "vitest";

import type { RawGradeRecord } from "@/domain/ports";
import {
  createAssessmentRepository,
  createOutcomeRepository,
  createPredictionRepository,
  createReflectionRepository,
} from "@/adapters/memory";
import { createDeterministicLanguageCapability } from "@/adapters/language";
import { createMockEvidenceSource, evidenceOutcomeId } from "@/adapters/evidence";
import { createEvidenceIngestion } from "@/application/ingest";
import { makePrediction, makeReflection } from "../fixtures/domain";

/**
 * The ingestion service end to end over in-memory adapters: pull → normalize →
 * gate → reconcile. Zero LLM in the eligibility/calibration path throughout.
 */

const RECORDED = "2026-01-01T12:00:00.000Z"; // after the fixture prediction (10:00)

function harness(records: RawGradeRecord[], withLanguage = false) {
  const assessments = createAssessmentRepository();
  const predictions = createPredictionRepository();
  const outcomes = createOutcomeRepository();
  const reflections = createReflectionRepository();
  const source = createMockEvidenceSource(records);
  const ingestion = createEvidenceIngestion({
    source,
    assessments,
    predictions,
    outcomes,
    reflections,
    ...(withLanguage
      ? {
          language: createDeterministicLanguageCapability(),
          skillCatalog: [{ id: "skill-slope", name: "interpreting slope" }],
        }
      : {}),
  });
  return { assessments, predictions, outcomes, reflections, source, ingestion };
}

const itemRecord = (overrides: Partial<RawGradeRecord> = {}): RawGradeRecord => ({
  externalId: "gb-1",
  studentId: "stu-1",
  assessmentRef: "assess-1",
  recordedAt: RECORDED,
  items: [
    { itemRef: "item-1", skillTag: "skill-a", correct: true, maxPoints: 1 },
    { itemRef: "item-2", skillTag: "skill-b", correct: false, maxPoints: 1 },
  ],
  ...overrides,
});

describe("evidence ingestion", () => {
  it("prior prediction + item data → full calibration including perSkill", async () => {
    const h = harness([itemRecord()]);
    await h.predictions.save(makePrediction());

    const report = await h.ingestion.sync("stu-1");

    expect(report.quarantined).toEqual([]);
    expect(report.ingested).toHaveLength(1);
    const entry = report.ingested[0];
    expect(entry.eligibility.level).toBe("full");
    expect(entry.eligibility.calibrationEligible).toBe(true);
    expect(entry.eligibility.perSkillEligible).toBe(true);
    expect(entry.calibration?.summary.brier).not.toBeNull();
    expect(entry.calibration?.summary.bias).toBeCloseTo(0.65 - 0.5, 10);
    expect(entry.calibration?.perSkill?.map((s) => s.skillId)).toEqual([
      "skill-a",
      "skill-b",
    ]);
    // The evidence landed behind the repositories.
    expect(await h.outcomes.findById(entry.outcomeId)).not.toBeNull();
    expect(await h.assessments.findById("assess-1")).not.toBeNull();
  });

  it("same assessment, NO prior prediction → baseline only (never calibration)", async () => {
    const h = harness([itemRecord({ studentId: "stu-2" })]);
    // stu-1 predicted; stu-2 did not.
    await h.predictions.save(makePrediction());

    const report = await h.ingestion.sync("stu-2");

    const entry = report.ingested[0];
    expect(entry.eligibility.level).toBe("baseline");
    expect(entry.eligibility.calibrationEligible).toBe(false);
    expect(entry.calibration).toBeNull();
    // Baseline evidence still lands (LearningMap fodder), it just never calibrates.
    expect(await h.outcomes.findById(entry.outcomeId)).not.toBeNull();
  });

  it("total-score-only record → globalGap set, perSkill null", async () => {
    const h = harness([
      {
        studentId: "stu-1",
        assessmentRef: "assess-1",
        recordedAt: RECORDED,
        totalScore: 13,
        totalMax: 20,
      },
    ]);
    await h.predictions.save(makePrediction()); // globalPredicted 0.7

    const report = await h.ingestion.sync("stu-1");

    const entry = report.ingested[0];
    expect(entry.eligibility.level).toBe("global");
    expect(entry.calibration?.summary.globalGap).toBeCloseTo(0.7 - 0.65, 10);
    expect(entry.calibration?.summary.brier).toBeNull();
    expect(entry.calibration?.perSkill).toBeNull();
  });

  it("re-ingesting a revised grade updates the outcome idempotently and flags reflections stale", async () => {
    const h = harness([itemRecord()]);
    await h.predictions.save(makePrediction());

    // First sync: grade lands; the student reflects on it.
    const first = await h.ingestion.sync("stu-1");
    expect(first.ingested[0].updated).toBe(false);
    const outcomeId = first.ingested[0].outcomeId;
    expect(outcomeId).toBe(evidenceOutcomeId("assess-1", "stu-1"));
    await h.reflections.save(
      makeReflection({ createdAt: new Date("2026-01-01T13:00:00.000Z") }),
    );

    // The gradebook revises item-2 to correct.
    h.source.add(
      itemRecord({
        recordedAt: "2026-01-02T09:00:00.000Z",
        revision: 2,
        status: "revised",
        items: [
          { itemRef: "item-1", skillTag: "skill-a", correct: true, maxPoints: 1 },
          { itemRef: "item-2", skillTag: "skill-b", correct: true, maxPoints: 1 },
        ],
      }),
    );
    const second = await h.ingestion.sync("stu-1");

    // Both rows re-pulled; the original re-applies without churn, the revision updates.
    const revised = second.ingested.find((e) => e.revision === 2);
    expect(revised?.updated).toBe(true);
    expect(revised?.outcomeId).toBe(outcomeId); // same identity — an UPDATE, not a duplicate
    expect(revised?.staleReflectionIds).toEqual(["ref-1"]);

    const stored = await h.outcomes.findById(outcomeId);
    expect(stored?.itemOutcomes.map((io) => io.correct)).toEqual([true, true]);

    // The reflection was flagged, not overwritten: its content survives.
    const reflection = await h.reflections.findById("ref-1");
    expect(reflection?.stale).toBe(true);
    expect(reflection?.attribution.note).toBe(
      makeReflection().attribution.note,
    );

    // Third sync of the identical world: fully idempotent, nothing re-flagged.
    const third = await h.ingestion.sync("stu-1");
    expect(third.ingested.every((e) => !e.updated)).toBe(true);
    expect(third.ingested.every((e) => e.staleReflectionIds.length === 0)).toBe(
      true,
    );
  });

  it("a malformed row is quarantined with a reason and the pipeline continues", async () => {
    const malformed: RawGradeRecord = {
      studentId: "stu-1",
      assessmentRef: "assess-broken",
      recordedAt: "not a date",
      totalScore: 7,
      totalMax: 10,
    };
    const h = harness([malformed, itemRecord()]);
    await h.predictions.save(makePrediction());

    const report = await h.ingestion.sync("stu-1");

    expect(report.quarantined).toHaveLength(1);
    expect(report.quarantined[0].record).toBe(malformed);
    expect(report.quarantined[0].reason).toContain("not a parseable date");
    // The healthy row still ingested — nothing threw.
    expect(report.ingested).toHaveLength(1);
    expect(report.ingested[0].eligibility.level).toBe("full");
  });

  it("zero tags + no language capability: the pipeline still works (item calibration, perSkill withheld)", async () => {
    const h = harness([
      itemRecord({
        items: [
          { itemRef: "item-1", correct: true },
          { itemRef: "item-2", correct: false },
        ],
      }),
    ]);
    await h.predictions.save(makePrediction());

    const report = await h.ingestion.sync("stu-1");

    const entry = report.ingested[0];
    expect(entry.eligibility.level).toBe("item");
    expect(entry.calibration?.summary.globalGap).not.toBeNull();
    expect(entry.calibration?.summary.brier).not.toBeNull();
    expect(entry.calibration?.perSkill).toBeNull();
  });

  it("the LanguageCapability tags untagged items (labor only) and unlocks perSkill", async () => {
    const h = harness(
      [
        itemRecord({
          items: [
            {
              itemRef: "item-1",
              correct: true,
              prompt: "Find the slope through (1, 2) and (3, 8).",
            },
            { itemRef: "item-2", correct: false, prompt: "No hints in this one." },
          ],
        }),
      ],
      true,
    );
    await h.predictions.save(makePrediction());

    const report = await h.ingestion.sync("stu-1");

    const entry = report.ingested[0];
    expect(entry.eligibility.level).toBe("full");
    expect(entry.calibration?.perSkill?.map((s) => s.skillId)).toEqual([
      "skill-slope",
    ]);
    // Eligibility itself remains deterministic — the capability only tagged.
    expect(entry.eligibility.reasons.join(" ")).toContain("skill tags");
  });
});
