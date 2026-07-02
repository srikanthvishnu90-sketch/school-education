import { describe, expect, it } from "vitest";

import {
  DomainError,
  EVIDENCE_SCHEMA_VERSION,
  UnconfirmedFieldMapError,
  assertFieldMapUsable,
  confirmFieldMap,
  isFieldMapUsable,
  receiveCanonical,
  remap,
  type CanonicalEvidence,
  type FieldMap,
} from "@/domain";

/**
 * The versioned canonical contract. A payload at a known older version is
 * migrated; anything else is quarantined with a reason — a foreign shape is
 * NEVER silently accepted. And an unconfirmed field map is structurally unusable.
 */

function validV2(): CanonicalEvidence {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    studentId: "stu-1",
    assessmentRef: "a-1",
    recordedAt: "2026-01-05T09:00:00.000Z",
    items: [{ itemRef: "i-1", skillTag: "skill-linear", correct: true }],
  };
}

describe("receiveCanonical — migrate-or-quarantine, never silent accept", () => {
  it("accepts current-version evidence", () => {
    const result = receiveCanonical(validV2());
    expect(result.ok).toBe(true);
  });

  it("migrates a known older version (v1 standardTag → v2 skillTag)", () => {
    const v1 = {
      schemaVersion: 1,
      studentId: "stu-1",
      assessmentRef: "a-1",
      recordedAt: "2026-01-05T09:00:00.000Z",
      items: [{ itemRef: "i-1", standardTag: "skill-linear", correct: true }],
    };
    const result = receiveCanonical(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evidence.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
      expect(result.evidence.items?.[0].skillTag).toBe("skill-linear");
    }
  });

  it("quarantines an unknown version instead of accepting a foreign shape", () => {
    const result = receiveCanonical({ ...validV2(), schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("schemaVersion 99");
  });

  it("quarantines a payload with no numeric schemaVersion", () => {
    const noVersion = {
      studentId: "stu-1",
      assessmentRef: "a-1",
      recordedAt: "2026-01-05T09:00:00.000Z",
    };
    expect(receiveCanonical(noVersion).ok).toBe(false);
  });

  it("quarantines a non-object", () => {
    expect(receiveCanonical("not evidence").ok).toBe(false);
    expect(receiveCanonical(null).ok).toBe(false);
  });

  it("quarantines a current-version payload that violates the shape", () => {
    const result = receiveCanonical({ ...validV2(), studentId: "" });
    expect(result.ok).toBe(false);
  });
});

describe("FieldMap — unconfirmed is structurally unusable", () => {
  const proposed: FieldMap = {
    providerId: "provider-x",
    mappings: { a: "studentId" },
    status: "proposed",
  };

  it("isFieldMapUsable only for a confirmed map", () => {
    expect(isFieldMapUsable(proposed)).toBe(false);
    expect(isFieldMapUsable(confirmFieldMap(proposed))).toBe(true);
  });

  it("assertFieldMapUsable throws on proposed, passes on confirmed", () => {
    expect(() => assertFieldMapUsable(proposed)).toThrow(UnconfirmedFieldMapError);
    expect(() => assertFieldMapUsable(confirmFieldMap(proposed))).not.toThrow();
  });

  it("UnconfirmedFieldMapError is a DomainError (catchable broadly)", () => {
    expect(() => assertFieldMapUsable(proposed)).toThrow(DomainError);
  });
});

describe("remap — vendor keys → canonical keys", () => {
  it("renames mapped keys, drops unmapped ones, and skips undefined values", () => {
    const native = { learner: "stu-1", quizId: "q-1", junk: "ignored", nada: undefined };
    expect(remap(native, { learner: "studentId", quizId: "assessmentRef" })).toEqual({
      studentId: "stu-1",
      assessmentRef: "q-1",
    });
  });
});
