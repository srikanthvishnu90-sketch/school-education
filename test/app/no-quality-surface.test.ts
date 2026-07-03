import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Standing prohibition (docs/honesty-and-data-integrity.md): ResponseQuality flags
 * are NEVER surfaced to a student, teacher, or admin — quarantine never confronts.
 * This greps the entire app surface for any response-quality signal term and fails
 * on a reference in real code, so the boundary can't erode by accident. (Comments
 * are stripped, so the docstrings naming the rule aren't themselves violations.)
 */
const APP_TREE = "src/app";
const FORBIDDEN =
  /\b(straightlining|zero_variance_affect|implausible_latency|no_coverage|responsequality|quality signal|quarantined session)\b/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("app surface — no response-quality flags exposed anywhere", () => {
  const files = walk(APP_TREE);

  it("scans a non-empty app tree", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("references no response-quality signal in any route or component", () => {
    const offenders: string[] = [];
    for (const file of files) {
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (FORBIDDEN.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
