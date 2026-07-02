import type { Id } from "@/domain";
import type { RawGradeRecord } from "@/domain/ports";
import { createDeterministicLanguageCapability } from "@/adapters/language";
import {
  createMockEvidenceSource,
  type MockEvidenceSource,
} from "@/adapters/evidence";
import {
  createEvidenceIngestion,
  type EvidenceIngestion,
  type IngestReport,
} from "./ingest";
import {
  ASSESSMENT_ID,
  CLASS_ID,
  ITEM_IDS,
  SEED_STUDENTS,
  SKILL_LINEAR,
  SKILL_SLOPE,
  buildAssessment,
  buildEmotionVocabulary,
  buildLearningMap,
  buildWorldCore,
  type SeedStudent,
  type SeededWorld,
} from "./seed";

/**
 * buildIngestedWorld — the evidence-driven composition root. Same wiring as the
 * seeded world, but the OUTCOMES are never seeded: they arrive as messy raw
 * gradebook rows through the EvidenceSource port and are ingested (normalized,
 * gated, reconciled). The agent's observation therefore assembles from
 * INGESTED evidence, and the whole loop still runs with zero infrastructure
 * and zero LLM. Fully deterministic: same inputs, same world.
 *
 * The mock gradebook is deliberately messy: string timestamps, a revised
 * grade (two revisions of the same row), a late grade, points-only rows with
 * no correctness flags, no skill tags anywhere, a historical total-only row
 * with no prior prediction (baseline only), and one malformed row that gets
 * quarantined while everything else proceeds.
 */

// Grades are recorded hours after the (clock-sequential) predictions.
const RECORDED_REV1 = "2026-01-05T14:00:00.000Z";
const RECORDED_REV2 = "2026-01-05T15:00:00.000Z";

/** Blake's pre-plumb unit-0 grade: no prediction existed → baseline only. */
export const HISTORICAL_ASSESSMENT_ID = "assess-algebra1-u0";

function recordFor(student: SeedStudent): RawGradeRecord {
  return {
    externalId: `gb-${student.id}`,
    studentId: student.id,
    assessmentRef: ASSESSMENT_ID,
    recordedAt: RECORDED_REV2,
    // Real gradebooks rarely carry skill tags or prompts — items are score-only.
    items: ITEM_IDS.map((itemRef, i) => ({
      itemRef,
      correct: student.corrects[i],
      pointsAwarded: student.corrects[i] ? 1 : 0,
      maxPoints: 1,
    })),
  };
}

function buildMessyGradebook(): RawGradeRecord[] {
  const [avery, blake, casey] = SEED_STUDENTS;

  // Avery's row was mis-graded first (item 2 marked correct), then REVISED.
  const averyRev1: RawGradeRecord = {
    ...recordFor(avery),
    recordedAt: RECORDED_REV1,
    status: "final",
    items: recordFor(avery).items?.map((item, i) =>
      i === 1 ? { ...item, correct: true, pointsAwarded: 1 } : item,
    ),
  };
  const averyRev2: RawGradeRecord = {
    ...recordFor(avery),
    revision: 2,
    status: "revised",
  };

  // Blake's row arrived late and is points-only (correctness derived).
  const blakeLate: RawGradeRecord = {
    ...recordFor(blake),
    status: "late",
    items: recordFor(blake).items?.map(({ itemRef, pointsAwarded, maxPoints }) => ({
      itemRef,
      pointsAwarded,
      maxPoints,
    })),
  };

  // Blake also has a HISTORICAL total-only grade — no prediction ever existed
  // for it, so it can only ever be baseline evidence.
  const blakeHistorical: RawGradeRecord = {
    externalId: "gb-u0-blake",
    studentId: blake.id,
    assessmentRef: HISTORICAL_ASSESSMENT_ID,
    assessmentTitle: "Algebra I — Unit 0 review",
    recordedAt: "2025-11-10T12:00:00.000Z",
    status: "final",
    totalScore: 13,
    totalMax: 20,
  };

  // A malformed export row: unparseable timestamp, half a total, no items.
  const broken: RawGradeRecord = {
    externalId: "gb-broken",
    studentId: avery.id,
    assessmentRef: "assess-algebra1-quiz0",
    recordedAt: "last tuesday",
    totalScore: 7,
  };

  return [averyRev1, averyRev2, blakeLate, blakeHistorical, broken, recordFor(casey)];
}

export interface IngestedWorld extends SeededWorld {
  source: MockEvidenceSource;
  ingestion: EvidenceIngestion;
  /** The per-student sync reports (quarantine + eligibility surfaced). */
  reports: Record<Id, IngestReport>;
}

export async function buildIngestedWorld(): Promise<IngestedWorld> {
  const { repos, clock, ids, services, verification, agent } = buildWorldCore();

  // Static world — the teacher's assessment structure is known up front (that
  // is what students pre-register predictions against); grades are not.
  await repos.assessments.save(buildAssessment());
  await repos.learningMaps.save(buildLearningMap());
  await repos.emotionVocab.save(buildEmotionVocabulary());

  // Forethought + monitoring happen BEFORE any grade exists.
  for (const s of SEED_STUDENTS) {
    await services.captureGoal({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      targetScore: s.targetScore,
      whyItMatters: s.whyItMatters,
      successCriteriaRef: s.successCriteriaRef,
    });
    await services.capturePrediction({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      itemPredictions: ITEM_IDS.map((itemId, i) => ({
        itemId,
        confidence: s.confidences[i],
      })),
      globalPredicted: s.globalPredicted,
    });
  }

  // Evidence arrives from the (messy) gradebook and is ingested.
  const source = createMockEvidenceSource(buildMessyGradebook());
  const ingestion = createEvidenceIngestion({
    source,
    assessments: repos.assessments,
    predictions: repos.predictions,
    outcomes: repos.outcomes,
    reflections: repos.reflections,
    language: createDeterministicLanguageCapability(),
    skillCatalog: [
      { id: SKILL_LINEAR, name: "linear equations" },
      { id: SKILL_SLOPE, name: "interpreting slope" },
    ],
  });

  const reports: Record<Id, IngestReport> = {};
  for (const s of SEED_STUDENTS) {
    reports[s.id] = await ingestion.sync(s.id);
  }

  // Self-reflection phase: affect is named AFTER the evidence lands.
  for (const s of SEED_STUDENTS) {
    await services.captureAffect({
      studentId: s.id,
      assessmentId: ASSESSMENT_ID,
      labels: s.labels,
      phase: "post_evidence",
    });
  }

  return {
    services,
    verification,
    repos,
    agent,
    clock,
    ids,
    classId: CLASS_ID,
    assessmentId: ASSESSMENT_ID,
    students: SEED_STUDENTS.map((s) => ({ id: s.id, archetype: s.archetype })),
    source,
    ingestion,
    reports,
  };
}
