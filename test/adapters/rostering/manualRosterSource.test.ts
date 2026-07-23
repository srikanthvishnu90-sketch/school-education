import { describe, expect, it } from "vitest";

import { createManualRosterSource } from "@/adapters/rostering/manualRosterSource";

describe("manual roster source", () => {
  it("has kind 'manual' and is always configured", () => {
    const source = createManualRosterSource("");
    expect(source.kind).toBe("manual");
    expect(source.isConfigured()).toBe(true);
  });

  it("parses pasted names into ImportedStudent[] with stable slug ids", async () => {
    const source = createManualRosterSource("Ada Lovelace\nAlan Turing\n");
    const roster = await source.importRoster("course-1");

    expect(roster.source).toBe("manual");
    expect(roster.courseId).toBe("course-1");
    expect(roster.students).toEqual([
      { externalId: "ada-lovelace", displayName: "Ada Lovelace" },
      { externalId: "alan-turing", displayName: "Alan Turing" },
    ]);
  });

  it("reuses parseRoster normalisation: trims, collapses spaces, de-dupes", async () => {
    const source = createManualRosterSource("  Ada   Lovelace \nAda Lovelace\n\n");
    const roster = await source.importRoster("course-1");
    expect(roster.students).toEqual([
      { externalId: "ada-lovelace", displayName: "Ada Lovelace" },
    ]);
  });

  it("produces the same id on re-import (idempotent slug)", async () => {
    const first = await createManualRosterSource("Grace Hopper").importRoster("c");
    const second = await createManualRosterSource("Grace Hopper").importRoster("c");
    expect(first.students).toEqual(second.students);
  });
});
