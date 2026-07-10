import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Assessment } from "@/domain/skill";
import type { LearningGoal } from "@/domain/goal";
import type { Outcome } from "@/domain/outcome";
import type { Reflection } from "@/domain/reflection";
import type { TransferProbe } from "@/domain/transferProbe";
import type { LearningMap } from "@/domain/learningMap";
import type { AffectSnapshot } from "@/domain/emotion";
import { EVIDENCE_SCHEMA_VERSION, type ProviderCapabilities } from "@/domain";
import type { Clock } from "@/domain/ports";
import {
  createPgAffectRepository,
  createPgAssessmentRepository,
  createPgClient,
  createPgEvidenceProvider,
  createPgGoalRepository,
  createPgLearningMapRepository,
  createPgOutcomeRepository,
  createPgReflectionRepository,
  createPgTransferProbeRepository,
  runMigrations,
  seedPgProvider,
  truncateAll,
  type PoolClient,
} from "@/adapters/supabase";
import { defineRepositoryContract } from "../../support/repositoryContract";
import { defineProviderContract } from "../../support/providerContract";

/**
 * The EXISTING contract suites, run unchanged against the Postgres adapters — the
 * second implementation of the same ports. Gated on TEST_DATABASE_URL so
 * `pnpm check` stays portable; set it to run against a real Postgres.
 */

const DB = process.env.TEST_DATABASE_URL;
const suite = DB ? describe : describe.skip;

const AT = new Date("2026-01-05T09:00:00.000Z");

// The identical fixtures the in-memory adapters are held to.
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
  attribution: { category: "strategy", specific: true, controllable: true, note: "n" },
  nextAction: { text: "do", dueBy: AT },
  exemplarReviewed: reviewed,
  createdAt: AT,
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

const CAPS: ProviderCapabilities = {
  itemLevel: true,
  skillTags: true,
  attendance: false,
};

function validEvidence(ref: string): unknown {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    studentId: "pg-stu",
    assessmentRef: ref,
    recordedAt: "2026-01-05T09:00:00.000Z",
    items: [
      { itemRef: `${ref}-i1`, skillTag: "skill-linear", correct: true, pointsAwarded: 1, maxPoints: 1 },
    ],
  };
}

suite("Postgres adapters — existing contracts, second implementation", () => {
  let client: PoolClient;
  const clock: Clock = { now: () => AT };

  beforeAll(async () => {
    client = createPgClient(DB as string);
    await runMigrations(client);
    await truncateAll(client);
    // Seed the three provider datasets the provider contract exercises.
    await seedPgProvider(client, clock, {
      providerId: "pg-confirmed",
      fieldMap: { providerId: "pg-confirmed", mappings: {}, status: "confirmed" },
      rows: [
        { studentId: "pg-stu", payload: validEvidence("q-1") },
        { studentId: "pg-stu", payload: validEvidence("q-2") },
      ],
    });
    await seedPgProvider(client, clock, {
      providerId: "pg-proposed",
      fieldMap: { providerId: "pg-proposed", mappings: {}, status: "proposed" },
      rows: [{ studentId: "pg-stu", payload: validEvidence("q-1") }],
    });
    await seedPgProvider(client, clock, {
      providerId: "pg-malformed",
      fieldMap: { providerId: "pg-malformed", mappings: {}, status: "confirmed" },
      rows: [
        { studentId: "pg-stu", payload: validEvidence("q-1") },
        { studentId: "pg-stu", payload: validEvidence("q-2") },
        {
          studentId: "pg-stu",
          payload: {
            schemaVersion: 99,
            studentId: "pg-stu",
            assessmentRef: "bad",
            recordedAt: "2026-01-05T09:00:00.000Z",
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await client.end();
  });

  // --- The repository contract, unmodified, over the 9 aggregates. -----------

  defineRepositoryContract({
    name: "PgAssessmentRepository",
    makeRepo: () => createPgAssessmentRepository(client, clock),
    entityA: assessment("A"),
    entityB: assessment("B"),
    keyA: "a1",
    unknownKey: "nope",
    save: (r, e) => r.save(e),
    findById: (r, id) => r.findById(id),
  });
  defineRepositoryContract({
    name: "PgGoalRepository",
    makeRepo: () => createPgGoalRepository(client, clock),
    entityA: goal(0.5),
    entityB: goal(0.9),
    keyA: "g1",
    unknownKey: "nope",
    save: (r, e) => r.save(e),
    findById: (r, id) => r.findById(id),
  });
  defineRepositoryContract({
    name: "PgOutcomeRepository",
    makeRepo: () => createPgOutcomeRepository(client, clock),
    entityA: outcome(true),
    entityB: outcome(false),
    keyA: "o1",
    unknownKey: "nope",
    save: (r, e) => r.save(e),
    findById: (r, id) => r.findById(id),
  });
  defineRepositoryContract({
    name: "PgReflectionRepository",
    makeRepo: () => createPgReflectionRepository(client, clock),
    entityA: reflection(true),
    entityB: reflection(false),
    keyA: "r1",
    unknownKey: "nope",
    save: (r, e) => r.save(e),
    findById: (r, id) => r.findById(id),
  });
  defineRepositoryContract({
    name: "PgTransferProbeRepository",
    makeRepo: () => createPgTransferProbeRepository(client, clock),
    entityA: probe("item-1"),
    entityB: probe("item-2"),
    keyA: "tp1",
    unknownKey: "nope",
    save: (r, e) => r.save(e),
    findById: (r, id) => r.findById(id),
  });
  defineRepositoryContract({
    name: "PgLearningMapRepository (keyed by skillId)",
    makeRepo: () => createPgLearningMapRepository(client, clock),
    entityA: learningMap("band-1"),
    entityB: learningMap("band-2"),
    keyA: "skill-1",
    unknownKey: "skill-nope",
    save: (r, e) => r.save(e),
    findById: (r, key) => r.findBySkill(key),
  });
  defineRepositoryContract({
    name: "PgAffectRepository",
    makeRepo: () => createPgAffectRepository(client, clock),
    entityA: snapshot(0.3),
    entityB: snapshot(-0.3),
    keyA: "aff1",
    unknownKey: "nope",
    save: (r, e) => r.save(e),
    findById: (r, id) => r.findById(id),
  });

  // --- The provider contract, unmodified, over a Postgres provider. ----------

  defineProviderContract({
    name: "PgEvidenceProvider",
    capabilities: CAPS,
    studentId: "pg-stu",
    emptyStudentId: "pg-none",
    validCount: 2,
    makeConfirmed: () =>
      createPgEvidenceProvider(client, { providerId: "pg-confirmed", capabilities: CAPS }),
    makeProposed: () =>
      createPgEvidenceProvider(client, { providerId: "pg-proposed", capabilities: CAPS }),
    makeWithMalformedRow: () =>
      createPgEvidenceProvider(client, { providerId: "pg-malformed", capabilities: CAPS }),
  });

  // --- Persistence specifics beyond the shared contract. ---------------------

  describe("persistence specifics", () => {
    it("created_at is stamped from the injected clock, never DB now()", async () => {
      const fixed = new Date("2030-06-01T00:00:00.000Z");
      const repo = createPgGoalRepository(client, { now: () => fixed });
      await repo.save({
        id: "det-goal",
        studentId: "det-s",
        assessmentId: "det-a",
        targetScore: 0.5,
        whyItMatters: "x",
        createdAt: fixed,
      });
      const { rows } = await client.query<{ created_at: string }>(
        "select created_at from academic.goals where id = $1",
        ["det-goal"],
      );
      expect(new Date(rows[0].created_at).toISOString()).toBe(fixed.toISOString());
    });

    it("listByStudent preserves insertion order", async () => {
      const goals = createPgGoalRepository(client, clock);
      await goals.save({ ...goal(0.5), id: "qg1", studentId: "qs1" });
      await goals.save({ ...goal(0.6), id: "qg2", studentId: "qs2" });
      await goals.save({ ...goal(0.7), id: "qg3", studentId: "qs1" });
      const forS1 = await goals.listByStudent("qs1");
      expect(forS1.map((g) => g.id)).toEqual(["qg1", "qg3"]);
    });
  });
});
