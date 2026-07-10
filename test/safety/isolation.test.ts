import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The safety module is DELIBERATELY isolated (P16): src/safety may be imported ONLY
 * at a capture boundary. The agent policy, calibration, and all analytics must
 * never touch escalation data — a crisis text is routed to humans, never fed to a
 * model or an aggregate. This test greps every import of the module and fails if
 * anything outside the allowlist reaches for it.
 */

const SRC = "src";
// The ONLY files permitted to import src/safety (besides src/safety itself):
// the shared safety world that the capture boundary and the counselor surface
// both build on.
const ALLOWLIST = new Set(["src/app/_world/safetyWorld.ts"]);
const IMPORTS_SAFETY = /from\s+["'](@\/safety|(?:\.\.?\/)+safety)(\/[^"']*)?["']/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("src/safety isolation", () => {
  const files = walk(SRC).map((f) => f.split("\\").join("/"));

  it("is imported only at the capture boundary", () => {
    const offenders = files.filter(
      (file) =>
        !file.startsWith("src/safety/") &&
        !ALLOWLIST.has(file) &&
        IMPORTS_SAFETY.test(readFileSync(file, "utf8")),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the analytics and intelligence modules never reference escalation data", () => {
    // The reflection-intelligence layer and pilot analytics summarize learning;
    // they must never import the safety module or reason about crisis data. Safety
    // detection is injected as an opaque boolean hook and lives only behind the
    // capture boundary (src/app/_world/safetyWorld.ts).
    const analytics = [
      "src/application/pilot.ts",
      "src/adapters/intelligence/llm.ts",
      "src/domain/intelligence/insight.ts",
      "src/domain/intelligence/signals.ts",
    ];
    for (const file of analytics) {
      const src = readFileSync(file, "utf8");
      expect(IMPORTS_SAFETY.test(src), `${file} imports safety`).toBe(false);
      expect(/crisis/i.test(src), `${file} references crisis`).toBe(false);
    }
  });
});
