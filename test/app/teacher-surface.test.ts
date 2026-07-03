import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The teacher surface is instructional, not surveillance: affect, emotion, and
 * reflection text are structurally ABSENT from its routes and components — not
 * merely blocked by RLS. This greps the teacher route tree and fails on any
 * reference (identifier or copy), so the boundary can't erode by accident.
 */
const TEACHER_TREE = "src/app/class";
const FORBIDDEN = /\b(affect|emotion|emotional|reflection|feeling|granularity)\b/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Strip comments so the docstring NAMING the rule is not itself a violation. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("teacher surface tree — no affect/emotion/reflection", () => {
  const files = walk(TEACHER_TREE);

  it("scans a non-empty teacher surface", () => {
    expect(files.length).toBeGreaterThan(2);
  });

  it("references no affect, emotion, or reflection anywhere", () => {
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
