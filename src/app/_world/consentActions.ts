"use server";

import { hasScope } from "@/domain";
import { getSessionStudent } from "./session";
import { getWorld } from "./world";

/**
 * The consent gate for reflection. A reflection captures emotional free-text from
 * a minor, so — before any of it is collected — the student must have a granted
 * `affect` consent scope, and for an under-13 student that consent must come from
 * a parent (COPPA). Consent is recorded through the existing ConsentService, so it
 * persists exactly like the rest of the world (Postgres when configured).
 */

export interface ConsentResult {
  ok: boolean;
  error?: string;
}

/** True when the signed-in student has granted affect consent (may reflect). */
export async function hasReflectionConsent(): Promise<boolean> {
  const studentId = await getSessionStudent();
  if (studentId === null) return false;
  const world = await getWorld();
  const records = await world.repos.consent.listByStudent(studentId);
  return hasScope(records, "affect");
}

/**
 * Record consent to reflect. An under-13 student REQUIRES parental consent
 * (grantorType "parent"); a 13+ student may self-consent. Grants academic +
 * affect so the reflection loop and its emotional data are covered.
 */
export async function grantReflectionConsent(
  under13: boolean,
  parentConsent: boolean,
): Promise<ConsentResult> {
  const studentId = await getSessionStudent();
  if (studentId === null) {
    return { ok: false, error: "Sign in as a student first." };
  }
  if (under13 && !parentConsent) {
    return {
      ok: false,
      error: "A parent or guardian must give consent for students under 13.",
    };
  }
  const world = await getWorld();
  await world.consentService.grant({
    studentId,
    grantorType: under13 ? "parent" : "self",
    scopes: ["academic", "affect"],
  });
  return { ok: true };
}
