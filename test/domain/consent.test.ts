import { describe, expect, it } from "vitest";

import {
  createConsentRecord,
  effectiveScopes,
  hasScope,
  type ConsentRecord,
} from "@/domain";

/**
 * Consent is a lifecycle object, not a flag. The effective scopes replay the
 * record history in time order: a grant adds scopes, a later revocation removes
 * them. This is what gates affect capture.
 */

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-02-01T00:00:00.000Z");

function grant(
  id: string,
  scopes: ConsentRecord["scopes"],
  at: Date,
): ConsentRecord {
  return createConsentRecord({
    id,
    studentId: "stu-1",
    grantorType: "parent",
    scopes,
    status: "granted",
    grantedAt: at,
  });
}

function revoke(
  id: string,
  scopes: ConsentRecord["scopes"],
  at: Date,
): ConsentRecord {
  return createConsentRecord({
    id,
    studentId: "stu-1",
    grantorType: "self",
    scopes,
    status: "revoked",
    grantedAt: at,
    revokedAt: at,
  });
}

describe("effectiveScopes / hasScope", () => {
  it("a grant makes its scopes effective", () => {
    const records = [grant("c1", ["academic", "affect"], T0)];
    expect([...effectiveScopes(records)].sort()).toEqual(["academic", "affect"]);
    expect(hasScope(records, "affect")).toBe(true);
  });

  it("revoking affect withdraws only affect; academic remains", () => {
    const records = [
      grant("c1", ["academic", "affect"], T0),
      revoke("c2", ["affect"], T1),
    ];
    expect([...effectiveScopes(records)]).toEqual(["academic"]);
    expect(hasScope(records, "affect")).toBe(false);
    expect(hasScope(records, "academic")).toBe(true);
  });

  it("replays strictly in time order, not array order", () => {
    // Revoke recorded before the grant in the array, but LATER in time → wins.
    const records = [
      revoke("c2", ["affect"], T1),
      grant("c1", ["academic", "affect"], T0),
    ];
    expect(hasScope(records, "affect")).toBe(false);
  });

  it("no records → no scopes", () => {
    expect(hasScope([], "affect")).toBe(false);
    expect(effectiveScopes([]).size).toBe(0);
  });
});
