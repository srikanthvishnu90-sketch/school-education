import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A token-usage lint: red and green are FORBIDDEN as accuracy semantics anywhere
 * on the student surface (CLAUDE.md). Alignment is ink-tint, a gap is warm — the
 * only sanctioned state colors. This scans the cycle surface for any red/green
 * color usage (Tailwind classes or CSS color words/hex) and fails on a hit.
 */

const SURFACE_DIRS = [
  "src/app/_ui",
  "src/app/_world",
  "src/app/chat",
  "src/app/lessons",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// Actual color USAGE that would encode accuracy as red/green — Tailwind color
// utilities, red/green hex, or a color keyword assigned to a fill/stroke/color.
// (Prose in comments naming the rule is not usage; comments are stripped first.)
const RED_GREEN =
  /(?:bg|text|border|from|via|to|fill|stroke|ring|outline|decoration|accent|caret|divide|placeholder)-(?:red|green|emerald|lime|rose|pink)-\d{2,3}|#(?:ff0000|00ff00|008000|dc2626|16a34a|22c55e|ef4444|f87171|4ade80)\b|(?:fill|stroke|color|background(?:Color)?)\s*[:=]\s*["']?(?:red|green|lime|crimson|scarlet)\b/i;

/** Strip block and line comments so documentation of the rule is not flagged. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

describe("student surface — no red/green accuracy coding", () => {
  const files = SURFACE_DIRS.flatMap(walk);

  it("scans a non-empty surface", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("contains no red/green color usage on any cycle file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        if (RED_GREEN.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
