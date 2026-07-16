import { afterEach, describe, expect, it } from "vitest";

import {
  getRoster,
  parseRoster,
  redactionTermsFor,
  refreshRosterRedactionTerms,
  rosterRedactionTerms,
  saveRoster,
  __setRosterStoreForTest,
} from "@/app/_world/rosterNames";
import { stripPii } from "@/adapters/language/pii";

afterEach(() => __setRosterStoreForTest(null));

describe("parseRoster", () => {
  it("trims, collapses whitespace, drops blanks, and de-dupes", () => {
    expect(parseRoster("  Jordan Lee \n\n Sam   Rivera \nJordan Lee\n")).toEqual([
      "Jordan Lee",
      "Sam Rivera",
    ]);
  });
});

describe("redactionTermsFor", () => {
  it("expands each full name into the full name plus its >=3-char tokens", () => {
    expect(redactionTermsFor(["Jordan Lee"]).sort()).toEqual(
      ["Jordan", "Jordan Lee", "Lee"].sort(),
    );
    // Two-letter tokens are dropped to avoid over-redacting initials/short words.
    expect(redactionTermsFor(["Al Vo"])).toEqual(["Al Vo"]);
  });
});

describe("roster → PII redaction", () => {
  it("a saved roster name is redacted on the next model call", async () => {
    await saveRoster("teacher-1", "district-demo", ["Jordan Lee"]);
    // saveRoster refreshes the snapshot the adapter's live resolver reads.
    expect(rosterRedactionTerms()).toContain("Jordan");

    const { clean } = stripPii(
      "Jordan struggled with factoring today",
      rosterRedactionTerms(),
    );
    expect(clean).not.toContain("Jordan");
  });

  it("unions names across teachers and reflects a cleared roster after refresh", async () => {
    await saveRoster("teacher-1", "district-demo", ["Jordan Lee"]);
    await saveRoster("teacher-2", "district-demo", ["Sam Rivera"]);
    const terms = await refreshRosterRedactionTerms();
    expect(terms).toEqual(expect.arrayContaining(["Jordan", "Sam", "Rivera"]));

    await saveRoster("teacher-1", "district-demo", []);
    expect(await getRoster("teacher-1")).toEqual([]);
  });
});
