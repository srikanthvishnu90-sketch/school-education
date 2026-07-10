import { beforeEach, describe, expect, it } from "vitest";

import {
  createAffectRepository,
  createAssessmentRepository,
  createConsentRepository,
  createGoalRepository,
  createOutcomeRepository,
  createReflectionRepository,
  createSequentialClock,
  createSequentialIdGenerator,
  createTransferProbeRepository,
} from "@/adapters/memory";
import {
  AffectConsentError,
  createConsentService,
  createServices,
  type ConsentService,
  type Services,
} from "@/application";
import type {
  AffectRepository,
  ConsentRepository,
  GoalRepository,
} from "@/domain/ports";

/**
 * Consent gates affect capture, and revocation runs the deletion workflow:
 * affect hard-deleted, a receipt recorded, academic retained.
 */

let services: Services;
let consentService: ConsentService;
let consent: ConsentRepository;
let affects: AffectRepository;
let goals: GoalRepository;

const STUDENT = "stu-1";
const AFFECT = {
  studentId: STUDENT,
  assessmentId: "a1",
  labels: [{ term: "content", valence: 0.3, arousal: 0.3 }],
  phase: "post_evidence" as const,
};

beforeEach(() => {
  const clock = createSequentialClock(Date.UTC(2026, 0, 5));
  const ids = createSequentialIdGenerator();
  consent = createConsentRepository();
  affects = createAffectRepository();
  goals = createGoalRepository();
  services = createServices({
    clock,
    ids,
    assessments: createAssessmentRepository(),
    goals,
    outcomes: createOutcomeRepository(),
    reflections: createReflectionRepository(),
    transferProbes: createTransferProbeRepository(),
    affects,
    consent,
  });
  consentService = createConsentService({ clock, ids, consent, affects });
});

describe("affect capture consent gate", () => {
  it("refuses affect capture without a granted affect scope", async () => {
    await expect(services.captureAffect(AFFECT)).rejects.toBeInstanceOf(
      AffectConsentError,
    );
    expect(await affects.listByStudent(STUDENT)).toHaveLength(0);
  });

  it("permits affect capture once affect is granted", async () => {
    await consentService.grant({
      studentId: STUDENT,
      grantorType: "parent",
      scopes: ["academic", "affect"],
    });
    const result = await services.captureAffect(AFFECT);
    expect(result.snapshot.studentId).toBe(STUDENT);
    expect(await affects.listByStudent(STUDENT)).toHaveLength(1);
  });

  it("refuses again after affect is revoked (academic-only consent)", async () => {
    await consentService.grant({
      studentId: STUDENT,
      grantorType: "parent",
      scopes: ["academic", "affect"],
    });
    await consentService.revoke({ studentId: STUDENT, scopes: ["affect"] });
    await expect(services.captureAffect(AFFECT)).rejects.toBeInstanceOf(
      AffectConsentError,
    );
  });
});

describe("revocation deletion workflow", () => {
  it("hard-deletes affect, records a receipt, retains academic", async () => {
    await consentService.grant({
      studentId: STUDENT,
      grantorType: "parent",
      scopes: ["academic", "affect"],
    });
    await services.captureAffect(AFFECT);
    // An academic artifact that must survive revocation.
    await services.captureGoal({
      studentId: STUDENT,
      assessmentId: "a1",
      targetScore: 0.7,
      whyItMatters: "I want to understand this.",
    });

    const { receipts } = await consentService.revoke({
      studentId: STUDENT,
      scopes: ["affect"],
    });

    // Affect is gone.
    expect(await affects.listByStudent(STUDENT)).toHaveLength(0);
    // A deletion receipt exists and counts what it removed.
    expect(receipts).toHaveLength(1);
    expect(receipts[0].scope).toBe("affect");
    expect(receipts[0].rowsDeleted).toBe(1);
    expect(await consent.listReceipts(STUDENT)).toHaveLength(1);
    // Academic data is retained (revocation never touched it).
    expect(await goals.listByStudent(STUDENT)).toHaveLength(1);
  });
});
