import { describe, expect, it } from "vitest";

import { parseCsv } from "@/adapters/provider";

/** The RFC 4180 subset the gradebook path relies on: quotes, embedded commas and
 * newlines, doubled quotes, CRLF, and blank-line skipping. */
describe("parseCsv", () => {
  it("keys rows by header and trims cells", () => {
    const { header, rows } = parseCsv("a,b\n1, 2 \n3,4\n");
    expect(header).toEqual(["a", "b"]);
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("honors quoted fields with commas and newlines", () => {
    const { rows } = parseCsv('name,note\n"Doe, Jane","line1\nline2"\n');
    expect(rows[0].name).toBe("Doe, Jane");
    expect(rows[0].note).toBe("line1\nline2");
  });

  it("unescapes doubled quotes and handles CRLF", () => {
    const { rows } = parseCsv('q\r\n"she said ""hi"""\r\n');
    expect(rows[0].q).toBe('she said "hi"');
  });

  it("skips blank lines and fills short rows", () => {
    const { rows } = parseCsv("a,b\n\n1\n");
    expect(rows).toEqual([{ a: "1", b: "" }]);
  });
});
