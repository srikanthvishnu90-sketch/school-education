import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The database driver stays sealed inside src/adapters/supabase. Nothing else in
 * the app may import `pg` or `@supabase/*` — the domain and services depend only
 * on ports, so the persistence choice never leaks outward.
 */
const SEALED = join("src", "adapters", "supabase");
const DRIVER_IMPORT =
  /from\s+["']pg["']|from\s+["']@supabase|require\(\s*["']pg["']\s*\)/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("driver isolation", () => {
  it("no `pg`/`@supabase` import outside src/adapters/supabase", () => {
    const offenders = walk("src")
      .filter((f) => !f.startsWith(SEALED))
      .filter((f) => DRIVER_IMPORT.test(readFileSync(f, "utf8")));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
