import { applyMigrations, createPgClient, type SqlClient } from "@/adapters/supabase";

/**
 * Lesson photos — illustrative context a teacher attaches to a lesson, kept OUT
 * of the pure domain (the reflection logic never reasons over them). Behind a
 * MediaStore port so the backend is swappable: an in-memory store for the
 * zero-infra dev world, and a durable Postgres-backed store when a database is
 * configured. The port is the object-storage seam — a real deployment points the
 * Postgres adapter's bytes at Supabase Storage / S3 and keeps only the keys here;
 * the callers never change.
 */

/** Max photos per lesson and per-photo byte budget, to keep payloads sane. */
export const MAX_PHOTOS = 6;
const MAX_DATA_URL_CHARS = 3_000_000; // ~2.2MB decoded

export interface MediaStore {
  save(lessonId: string, dataUrls: readonly string[]): Promise<void>;
  get(lessonId: string): Promise<string[]>;
  delete(lessonId: string): Promise<void>;
}

/** Keep only well-formed, in-budget image data URLs, capped at MAX_PHOTOS. */
function sanitize(dataUrls: readonly string[]): string[] {
  return dataUrls
    .filter((u) => u.startsWith("data:image/") && u.length <= MAX_DATA_URL_CHARS)
    .slice(0, MAX_PHOTOS);
}

function createMemoryMediaStore(): MediaStore {
  const byLesson = new Map<string, string[]>();
  return {
    async save(lessonId, dataUrls) {
      const kept = sanitize(dataUrls);
      if (kept.length === 0) byLesson.delete(lessonId);
      else byLesson.set(lessonId, kept);
    },
    async get(lessonId) {
      return byLesson.get(lessonId) ?? [];
    },
    async delete(lessonId) {
      byLesson.delete(lessonId);
    },
  };
}

const MEDIA_DDL = `
create schema if not exists intel;
create table if not exists intel.lesson_media (
  lesson_id text primary key,
  photos jsonb not null,
  created_at timestamptz not null default now()
);`;

function createPgMediaStore(client: SqlClient): MediaStore {
  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> => {
    if (ready === null) {
      ready = applyMigrations(client, [
        { id: "0004_lesson_media", sql: MEDIA_DDL },
      ]).then(() => undefined);
    }
    return ready;
  };
  return {
    async save(lessonId, dataUrls) {
      await ensure();
      const kept = sanitize(dataUrls);
      if (kept.length === 0) {
        await client.query("delete from intel.lesson_media where lesson_id = $1", [
          lessonId,
        ]);
        return;
      }
      await client.query(
        `insert into intel.lesson_media (lesson_id, photos) values ($1, $2::jsonb)
         on conflict (lesson_id) do update set photos = excluded.photos`,
        [lessonId, JSON.stringify(kept)],
      );
    },
    async get(lessonId) {
      await ensure();
      const { rows } = await client.query<{ photos: string[] }>(
        "select photos from intel.lesson_media where lesson_id = $1",
        [lessonId],
      );
      return rows[0]?.photos ?? [];
    },
    async delete(lessonId) {
      await ensure();
      await client.query("delete from intel.lesson_media where lesson_id = $1", [
        lessonId,
      ]);
    },
  };
}

let storePromise: Promise<MediaStore> | null = null;
function store(): Promise<MediaStore> {
  if (storePromise === null) {
    const url = process.env.DATABASE_URL ?? "";
    const usePostgres =
      process.env.WORLD_BACKEND === "postgres" || url.length > 0;
    storePromise = Promise.resolve(
      usePostgres
        ? createPgMediaStore(createPgClient(url))
        : createMemoryMediaStore(),
    );
  }
  return storePromise;
}

/** Store the photos for a lesson (overwrites). Silently drops anything oversized. */
export async function saveLessonPhotos(
  lessonId: string,
  dataUrls: readonly string[],
): Promise<void> {
  await (await store()).save(lessonId, dataUrls);
}

/** The photos attached to a lesson, or an empty array. */
export async function getLessonPhotos(lessonId: string): Promise<string[]> {
  return (await store()).get(lessonId);
}

/** For tests: swap in an explicit store (e.g. memory) and reset the singleton. */
export function __setMediaStoreForTest(next: MediaStore | null): void {
  storePromise = next === null ? null : Promise.resolve(next);
}
