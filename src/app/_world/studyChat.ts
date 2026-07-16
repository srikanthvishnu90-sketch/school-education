import { applyMigrations, createPgClient, type SqlClient } from "@/adapters/supabase";
import { createDataCipher } from "@/adapters/supabase/cipher";
import type { AssistantMessage } from "./assistant";

/**
 * Persistence for the open study chat — one conversation per (student, course), so
 * a student's chat survives a refresh instead of resetting every time. It is
 * private student writing, so it is treated exactly like reflection data:
 *   · encrypted at rest when REFLECTION_KEY_HEX is set (AES-256-GCM envelope);
 *   · never exposed to a teacher;
 *   · erasable — deleteByStudent participates in the right-to-erasure path.
 * The opening greeting is NOT stored (it's derived from the name + course); only
 * the real exchange is.
 */

export interface StudyChatStore {
  load(studentId: string, courseId: string): Promise<AssistantMessage[]>;
  save(
    studentId: string,
    courseId: string,
    messages: readonly AssistantMessage[],
  ): Promise<void>;
  /** Hard-delete every study chat for a student (right-to-erasure). Returns the count. */
  deleteByStudent(studentId: string): Promise<number>;
}

/** Keep the stored conversation bounded — the last MAX_TURNS messages. */
const MAX_TURNS = 60;

const cipher = createDataCipher();

function encode(messages: readonly AssistantMessage[]): string {
  const json = JSON.stringify([...messages].slice(-MAX_TURNS));
  return cipher === null ? JSON.stringify({ raw: json }) : JSON.stringify({ enc: cipher.seal(json) });
}

function decode(stored: string): AssistantMessage[] {
  try {
    const env = JSON.parse(stored) as { raw?: string; enc?: string };
    const json =
      env.enc !== undefined && cipher !== null
        ? cipher.open(env.enc)
        : (env.raw ?? "[]");
    const parsed = JSON.parse(json) as AssistantMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createMemoryStudyChatStore(): StudyChatStore {
  const byKey = new Map<string, string>();
  const key = (s: string, c: string): string => `${s}::${c}`;
  return {
    async load(studentId, courseId) {
      const stored = byKey.get(key(studentId, courseId));
      return stored === undefined ? [] : decode(stored);
    },
    async save(studentId, courseId, messages) {
      byKey.set(key(studentId, courseId), encode(messages));
    },
    async deleteByStudent(studentId) {
      let n = 0;
      for (const k of [...byKey.keys()]) {
        if (k.startsWith(`${studentId}::`)) {
          byKey.delete(k);
          n += 1;
        }
      }
      return n;
    },
  };
}

const DDL = `
create schema if not exists intel;
create table if not exists intel.study_chats (
  student_id text not null,
  course_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);
create index if not exists study_chats_student_idx on intel.study_chats (student_id);`;

function createPgStudyChatStore(client: SqlClient): StudyChatStore {
  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> => {
    if (ready === null) {
      ready = applyMigrations(client, [{ id: "0006_study_chats", sql: DDL }]).then(
        () => undefined,
      );
    }
    return ready;
  };
  return {
    async load(studentId, courseId) {
      await ensure();
      const { rows } = await client.query<{ data: unknown }>(
        "select data from intel.study_chats where student_id = $1 and course_id = $2",
        [studentId, courseId],
      );
      const row = rows[0];
      return row === undefined ? [] : decode(JSON.stringify(row.data));
    },
    async save(studentId, courseId, messages) {
      await ensure();
      await client.query(
        `insert into intel.study_chats (student_id, course_id, data, updated_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (student_id, course_id)
         do update set data = excluded.data, updated_at = now()`,
        [studentId, courseId, encode(messages)],
      );
    },
    async deleteByStudent(studentId) {
      await ensure();
      const { rows } = await client.query<{ count: string }>(
        "with d as (delete from intel.study_chats where student_id = $1 returning 1) select count(*)::text as count from d",
        [studentId],
      );
      return Number(rows[0]?.count ?? "0");
    },
  };
}

let storePromise: Promise<StudyChatStore> | null = null;
function store(): Promise<StudyChatStore> {
  if (storePromise === null) {
    const url = process.env.DATABASE_URL ?? "";
    const usePostgres =
      process.env.WORLD_BACKEND === "postgres" || url.length > 0;
    storePromise = Promise.resolve(
      usePostgres ? createPgStudyChatStore(createPgClient(url)) : createMemoryStudyChatStore(),
    );
  }
  return storePromise;
}

export async function loadStudyChat(
  studentId: string,
  courseId: string,
): Promise<AssistantMessage[]> {
  return (await store()).load(studentId, courseId);
}

export async function saveStudyChat(
  studentId: string,
  courseId: string,
  messages: readonly AssistantMessage[],
): Promise<void> {
  await (await store()).save(studentId, courseId, messages);
}

export async function deleteStudyChatsByStudent(studentId: string): Promise<number> {
  return (await store()).deleteByStudent(studentId);
}

/** For tests: swap the store and reset the singleton. */
export function __setStudyChatStoreForTest(next: StudyChatStore | null): void {
  storePromise = next === null ? null : Promise.resolve(next);
}
