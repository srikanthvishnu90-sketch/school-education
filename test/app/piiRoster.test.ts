import { describe, expect, it } from "vitest";

import { piiRoster } from "@/app/_world/intelligence";
import { stripPii } from "@/adapters/language/pii";

/**
 * The roster is what makes PII redaction non-inert in the request path: without
 * it, `stripPii`'s extraTerms are empty and bare student/staff names sail through
 * to the model. These tests pin that the known names are present and actually
 * redact, while ordinary words that merely contain a name are left alone.
 */
describe("piiRoster", () => {
  it("includes seeded student first names and staff names (full + surname)", () => {
    const roster = piiRoster();
    for (const name of ["Avery", "Blake", "Casey", "Nadia", "Ms. Rivera", "Rivera", "Okafor"]) {
      expect(roster).toContain(name);
    }
  });

  it("redacts a student name written in free text before it leaves the process", () => {
    const { clean, count } = stripPii(
      "Avery said Ms. Rivera explained slope again",
      piiRoster(),
    );
    expect(clean).not.toContain("Avery");
    expect(clean).not.toContain("Rivera");
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("does not over-redact ordinary words that merely contain a name", () => {
    const { clean } = stripPii("I cleaned the kitchen after the lab", piiRoster());
    // "Chen" is on the roster; word-boundary matching must leave "kitchen" intact.
    expect(clean).toContain("kitchen");
  });
});
