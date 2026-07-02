import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail (see CLAUDE.md → Architecture): `src/domain` is pure.
 * It must not import from next, react, react-dom, or any adapter/app/ui layer.
 * This test walks the domain tree and asserts every import source is allowed.
 */

const domainDir = join(process.cwd(), "src", "domain");

const FORBIDDEN_SOURCES = [
  /^next(\/|$)/,
  /^react(\/|$|-dom)/,
  /^@\/(adapters|app|ui|application)(\/|$)/,
  /(^|\/)adapters\//,
  /(^|\/)app\//,
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function importSources(code: string): string[] {
  const sources: string[] = [];
  const patterns = [
    /import\s[^"']*from\s*["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\)/g,
    /import\(\s*["']([^"']+)["']\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      sources.push(match[1]);
    }
  }
  return sources;
}

describe("src/domain purity", () => {
  it("has no imports from framework or adapter layers", () => {
    const violations: string[] = [];
    for (const file of walk(domainDir)) {
      for (const source of importSources(readFileSync(file, "utf8"))) {
        if (FORBIDDEN_SOURCES.some((rx) => rx.test(source))) {
          violations.push(`${file}: imports "${source}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
