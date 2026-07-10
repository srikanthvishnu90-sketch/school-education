/**
 * Lesson photos — a small, process-lifetime store keyed by lesson id. Photos are
 * held as data URLs (no object storage in this pre-infra build), kept OUT of the
 * pure domain: they are illustrative context a teacher attaches, not something the
 * reflection logic reasons over. A real deployment swaps this for object storage.
 */

const byLesson = new Map<string, string[]>();

/** Max photos per lesson and per-photo byte budget, to keep the in-memory store sane. */
export const MAX_PHOTOS = 6;
const MAX_DATA_URL_CHARS = 3_000_000; // ~2.2MB decoded

/** Store the photos for a lesson (overwrites). Silently drops anything oversized. */
export function saveLessonPhotos(lessonId: string, dataUrls: string[]): void {
  const kept = dataUrls
    .filter((u) => u.startsWith("data:image/") && u.length <= MAX_DATA_URL_CHARS)
    .slice(0, MAX_PHOTOS);
  if (kept.length === 0) {
    byLesson.delete(lessonId);
    return;
  }
  byLesson.set(lessonId, kept);
}

/** The photos attached to a lesson, or an empty array. */
export function getLessonPhotos(lessonId: string): string[] {
  return byLesson.get(lessonId) ?? [];
}
