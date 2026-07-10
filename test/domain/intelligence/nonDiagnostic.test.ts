import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/common";
import {
  assertNonDiagnostic,
  findDiagnosticLanguage,
  isNonDiagnostic,
} from "@/domain/intelligence/nonDiagnostic";

/**
 * Product principle 4: the platform must never diagnose. Observed, transient
 * language is allowed; clinical labels and fixed-trait verdicts are not.
 */
describe("non-diagnostic guard", () => {
  it("allows observed, transient, task-focused language", () => {
    for (const ok of [
      "The student reported feeling rushed during the assessment.",
      "The student appears hesitant to ask for help.",
      "The student recently reported lower confidence during independent work.",
      "The student felt embarrassed and waited instead of asking.",
    ]) {
      expect(isNonDiagnostic(ok)).toBe(true);
    }
  });

  it("rejects clinical labels and diagnostic attribution", () => {
    for (const bad of [
      "The student has anxiety.",
      "The student is depressed.",
      "This looks like ADHD.",
      "The student has a learning disability.",
      "The student is emotionally unstable.",
      "The student suffers from a disorder.",
    ]) {
      expect(isNonDiagnostic(bad)).toBe(false);
      expect(findDiagnosticLanguage(bad).length).toBeGreaterThan(0);
      expect(() => assertNonDiagnostic(bad)).toThrow(DomainError);
    }
  });

  it("rejects fixed-trait verdicts about the person, not the work", () => {
    expect(isNonDiagnostic("The student is just lazy.")).toBe(false);
    expect(isNonDiagnostic("He is a slow learner.")).toBe(false);
  });
});
