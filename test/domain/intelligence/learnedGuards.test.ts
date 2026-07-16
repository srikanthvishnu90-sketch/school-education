import { afterEach, describe, expect, it } from "vitest";

import {
  isNonDiagnostic,
  assertNonDiagnostic,
} from "@/domain/intelligence/nonDiagnostic";
import {
  learnDiagnosticPattern,
  learnedGuardVersion,
  learnedGuardSummary,
  resetLearnedGuards,
} from "@/domain/intelligence/learnedGuards";
import { DomainError } from "@/domain/common";

/**
 * The self-improving loop: a phrase the base lexicon misses can be PROMOTED into a
 * learned rule that immediately strengthens the guard everywhere and bumps the
 * version — and it stays caught (a regression can never reopen the gap).
 */
afterEach(() => resetLearnedGuards());

describe("learned guards strengthen the non-diagnostic guard", () => {
  it("passes a phrase the base lexicon doesn't know, then catches it once learned", () => {
    // A euphemism the base lexicon doesn't cover — passes today.
    const miss = "This student is a lost cause on fractions.";
    expect(isNonDiagnostic(miss)).toBe(true);
    expect(learnedGuardVersion()).toBe(0);

    // Promote it (the review/agent step of the loop).
    learnDiagnosticPattern("\\blost cause\\b", "fixed-trait euphemism: 'lost cause'");

    // Now the SAME guard, everywhere, rejects it — and the version bumped.
    expect(learnedGuardVersion()).toBe(1);
    expect(isNonDiagnostic(miss)).toBe(false);
    expect(() => assertNonDiagnostic(miss)).toThrow(DomainError);
    expect(learnedGuardSummary()).toContain("fixed-trait euphemism: 'lost cause'");
  });

  it("is idempotent on the same source (replays don't inflate the version)", () => {
    learnDiagnosticPattern("\\bwrite[- ]?off\\b", "euphemism: 'write-off'");
    learnDiagnosticPattern("\\bwrite[- ]?off\\b", "euphemism: 'write-off'");
    expect(learnedGuardVersion()).toBe(1);
  });

  it("does not flag safe, observed language after learning a pattern", () => {
    learnDiagnosticPattern("\\blost cause\\b", "n");
    expect(isNonDiagnostic("Reported feeling rushed on the last two problems.")).toBe(
      true,
    );
  });
});
