import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_PHOTOS,
  getLessonPhotos,
  saveLessonPhotos,
  __setMediaStoreForTest,
} from "@/app/_world/lessonMedia";

// The default (no DATABASE_URL) store is in-memory; reset it between tests so
// state never leaks across cases.
afterEach(() => __setMediaStoreForTest(null));

const img = (n: number): string => `data:image/png;base64,${"A".repeat(n)}`;

describe("lesson media store", () => {
  it("round-trips photos for a lesson", async () => {
    await saveLessonPhotos("lesson-1", [img(10), img(20)]);
    expect(await getLessonPhotos("lesson-1")).toHaveLength(2);
    expect(await getLessonPhotos("lesson-other")).toEqual([]);
  });

  it("drops non-image and oversized payloads, and caps at MAX_PHOTOS", async () => {
    await saveLessonPhotos("lesson-2", [
      "javascript:alert(1)", // not an image
      "https://evil.example/x.png", // not a data URL
      img(4_000_000), // over the byte budget
      ...Array.from({ length: MAX_PHOTOS + 3 }, () => img(10)), // over the count cap
    ]);
    const kept = await getLessonPhotos("lesson-2");
    expect(kept.length).toBe(MAX_PHOTOS);
    expect(kept.every((u) => u.startsWith("data:image/"))).toBe(true);
  });

  it("saving an empty set clears the lesson's photos", async () => {
    await saveLessonPhotos("lesson-3", [img(10)]);
    await saveLessonPhotos("lesson-3", []);
    expect(await getLessonPhotos("lesson-3")).toEqual([]);
  });
});
