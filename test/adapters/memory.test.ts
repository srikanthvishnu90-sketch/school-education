import { describe, expect, it } from "vitest";

import type { Assessment } from "@/domain/skill";
import type { LearningGoal } from "@/domain/goal";
import type { Prediction } from "@/domain/prediction";
import type { Outcome } from "@/domain/outcome";
import type { Reflection } from "@/domain/reflection";
import type { CalibrationRecord } from "@/domain/calibration";
import type { TransferProbe } from "@/domain/transferProbe";
import type { LearningMap } from "@/domain/learningMap";
import type { AffectSnapshot } from "@/domain/emotion";
import {
  createAffectRepository,
  createAssessmentRepository,
  createCalibrationRepository,
  createEmotionVocabularyRepository,
  createGoalRepository,
  createLearningMapRepository,
  createOutcomeRepository,
  createPredictionRepository,
  createReflectionRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createTransferProbeRepository,
} from "@/adapters/memory";
import { defineRepositoryContract } from "../support/repositoryContract";

const AT = new Date("2026-01-05T09:00:00.000Z");

const assessment = (title: string): Assessment => ({
  id: "a1",
  title,
  items: [],
  createdAt: AT,
});
const goal = (target: number): LearningGoal => ({
  id: "g1",
  studentId: "s1",
  assessmentId: "a1",
  targetScore: target,
  whyItMatters: "reason",
  createdAt: AT,
});
const prediction = (gp: number): Prediction => ({
  id: "p1",
  assessmentId: "a1",
  studentId: "s1",
  itemPredictions: [{ itemId: "item-1", confidence: 0.5 }],
  globalPredicted: gp,
  createdAt: AT,
});
const outcome = (correct: boolean): Outcome => ({
  id: "o1",
  assessmentId: "a1",
  studentId: "s1",
  itemOutcomes: [{ itemId: "item-1", correct, pointsAwarded: correct ? 1 : 0 }],
  scoredAt: AT,
});
const reflection = (reviewed: boolean): Reflection => ({
  id: "r1",
  assessmentId: "a1",
  studentId: "s1",
  attribution: {
    category: "strategy",
    specific: true,
    controllable: true,
    note: "n",
  },
  nextAction: { text: "do", dueBy: AT },
  exemplarReviewed: reviewed,
  createdAt: AT,
});
const calibration = (brier: number): CalibrationRecord => ({
  id: "c1",
  assessmentId: "a1",
  studentId: "s1",
  brier,
  bias: 0,
  resolution: 0,
  itemCount: 1,
  computedAt: AT,
});
const probe = (itemId: string): TransferProbe => ({
  id: "tp1",
  assessmentId: "a1",
  skillId: "skill-1",
  itemId,
  createdAt: AT,
});
const learningMap = (currentBandId: string): LearningMap => ({
  id: "m1",
  skillId: "skill-1",
  bands: [],
  currentBandId,
});
const snapshot = (v: number): AffectSnapshot => ({
  id: "aff1",
  assessmentId: "a1",
  studentId: "s1",
  labels: [{ term: "content", valence: v, arousal: 0.3 }],
  phase: "post_evidence",
  createdAt: AT,
});

defineRepositoryContract({
  name: "AssessmentRepository",
  makeRepo: createAssessmentRepository,
  entityA: assessment("A"),
  entityB: assessment("B"),
  keyA: "a1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "GoalRepository",
  makeRepo: createGoalRepository,
  entityA: goal(0.5),
  entityB: goal(0.9),
  keyA: "g1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "PredictionRepository",
  makeRepo: createPredictionRepository,
  entityA: prediction(0.5),
  entityB: prediction(0.9),
  keyA: "p1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "OutcomeRepository",
  makeRepo: createOutcomeRepository,
  entityA: outcome(true),
  entityB: outcome(false),
  keyA: "o1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "ReflectionRepository",
  makeRepo: createReflectionRepository,
  entityA: reflection(true),
  entityB: reflection(false),
  keyA: "r1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "CalibrationRepository",
  makeRepo: createCalibrationRepository,
  entityA: calibration(0.1),
  entityB: calibration(0.2),
  keyA: "c1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "TransferProbeRepository",
  makeRepo: createTransferProbeRepository,
  entityA: probe("item-1"),
  entityB: probe("item-2"),
  keyA: "tp1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});
defineRepositoryContract({
  name: "LearningMapRepository (keyed by skillId)",
  makeRepo: createLearningMapRepository,
  entityA: learningMap("band-1"),
  entityB: learningMap("band-2"),
  keyA: "skill-1",
  unknownKey: "skill-nope",
  save: (r, e) => r.save(e),
  findById: (r, key) => r.findBySkill(key),
});
defineRepositoryContract({
  name: "AffectRepository",
  makeRepo: createAffectRepository,
  entityA: snapshot(0.3),
  entityB: snapshot(-0.3),
  keyA: "aff1",
  unknownKey: "nope",
  save: (r, e) => r.save(e),
  findById: (r, id) => r.findById(id),
});

describe("query methods return deterministic, filtered results", () => {
  it("GoalRepository.listByStudent filters by student, keeps insertion order", async () => {
    const repo = createGoalRepository();
    await repo.save({ ...goal(0.5), id: "g1", studentId: "s1" });
    await repo.save({ ...goal(0.6), id: "g2", studentId: "s2" });
    await repo.save({ ...goal(0.7), id: "g3", studentId: "s1" });
    const forS1 = await repo.listByStudent("s1");
    expect(forS1.map((g) => g.id)).toEqual(["g1", "g3"]);
  });

  it("PredictionRepository.findByAssessmentAndStudent returns the latest match", async () => {
    const repo = createPredictionRepository();
    await repo.save({ ...prediction(0.5), id: "p1" });
    await repo.save({ ...prediction(0.9), id: "p2" });
    const found = await repo.findByAssessmentAndStudent("a1", "s1");
    expect(found?.id).toBe("p2");
    expect(await repo.findByAssessmentAndStudent("a1", "other")).toBeNull();
  });

  it("AffectRepository.listByAssessmentAndStudent filters correctly", async () => {
    const repo = createAffectRepository();
    await repo.save({ ...snapshot(0.3), id: "aff1" });
    await repo.save({ ...snapshot(0.1), id: "aff2", studentId: "other" });
    const found = await repo.listByAssessmentAndStudent("a1", "s1");
    expect(found.map((a) => a.id)).toEqual(["aff1"]);
  });

  it("EmotionVocabularyRepository stores the single palette", async () => {
    const repo = createEmotionVocabularyRepository();
    expect(await repo.find()).toBeNull();
    const vocab = { terms: [{ term: "calm", valence: 0.3, arousal: 0.1 }] };
    await repo.save(vocab);
    expect(await repo.find()).toEqual(vocab);
  });
});

describe("deterministic clock + id generator", () => {
  it("clock advances by a fixed step per call", () => {
    const clock = createSequentialClock(1000, 500);
    expect(clock.now().getTime()).toBe(1000);
    expect(clock.now().getTime()).toBe(1500);
    expect(clock.now().getTime()).toBe(2000);
  });

  it("id generator counts per prefix from 1", () => {
    const ids = createSequentialIdGenerator();
    expect(ids.next("goal")).toBe("goal-1");
    expect(ids.next("goal")).toBe("goal-2");
    expect(ids.next("pred")).toBe("pred-1");
  });
});
