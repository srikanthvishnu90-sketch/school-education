import { describe, expect, it } from "vitest";

import {
  LEXICON_CHANGELOG,
  LEXICON_VERSION,
  lexiconContentHash,
} from "@/safety";

/**
 * The lexicon change-control lock (P16 acceptance): the crisis lexicon can never
 * drift silently. Editing the tier sources changes the content hash; the last
 * changelog entry must name the current version AND carry that hash, so any
 * unrecorded change fails CI. The changelog is append-only.
 */
describe("crisis lexicon change control", () => {
  it("the current version is recorded as the last changelog entry", () => {
    const last = LEXICON_CHANGELOG.at(-1);
    expect(last?.version).toBe(LEXICON_VERSION);
  });

  it("the recorded content hash matches the live lexicon (change without a bump fails CI)", () => {
    const last = LEXICON_CHANGELOG.at(-1);
    expect(lexiconContentHash()).toBe(last?.contentHash);
  });

  it("changelog versions and hashes are unique (append-only, no overwrite-in-place)", () => {
    const versions = LEXICON_CHANGELOG.map((e) => e.version);
    const hashes = LEXICON_CHANGELOG.map((e) => e.contentHash);
    expect(new Set(versions).size).toBe(versions.length);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
