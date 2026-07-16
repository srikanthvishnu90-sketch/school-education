import { applyMigrations, createPgClient, type SqlClient } from "@/adapters/supabase";

/**
 * The class roster — the student names a teacher registers for their class. It has
 * one job beyond display: it is the live source of truth for PII redaction. The
 * static seed roster only knows the demo students; a real class's names are
 * unknown until the teacher enters them, so redaction would sail those names
 * through to the model. Registering the roster feeds `allRosterNames()` into the
 * intelligence adapter's redaction set, which is resolved on every model call —
 * so the set grows with real data instead of staying frozen at build time.
 *
 * Rosters are keyed by teacher; `allRosterNames()` unions across every teacher,
 * because redacting a name that can't appear in a given payload only ever adds
 * privacy. Word-boundary matching downstream keeps short tokens from over-reaching.
 */

export interface RosterStore {
  save(teacherId: string, tenantId: string, names: readonly string[]): Promise<void>;
  get(teacherId: string): Promise<string[]>;
  allNames(): Promise<string[]>;
}

const MAX_NAMES = 200;

/** One name per line → trimmed, de-duplicated, bounded. */
export function parseRoster(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/\s+/g, " ");
    if (name.length >= 2 && name.length <= 80) seen.add(name);
    if (seen.size >= MAX_NAMES) break;
  }
  return [...seen];
}

/** Redaction terms from a set of full names: each full name plus its ≥3-char tokens. */
export function redactionTermsFor(names: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const full of names) {
    terms.add(full);
    for (const token of full.split(" ")) {
      if (token.length >= 3) terms.add(token);
    }
  }
  return [...terms];
}

function createMemoryRosterStore(): RosterStore {
  const byTeacher = new Map<string, string[]>();
  return {
    async save(teacherId, _tenantId, names) {
      const kept = [...names].slice(0, MAX_NAMES);
      if (kept.length === 0) byTeacher.delete(teacherId);
      else byTeacher.set(teacherId, kept);
    },
    async get(teacherId) {
      return byTeacher.get(teacherId) ?? [];
    },
    async allNames() {
      return [...new Set([...byTeacher.values()].flat())];
    },
  };
}

const ROSTER_DDL = `
create schema if not exists intel;
create table if not exists intel.class_rosters (
  teacher_id text primary key,
  tenant_id text not null,
  names jsonb not null,
  created_at timestamptz not null default now()
);`;

function createPgRosterStore(client: SqlClient): RosterStore {
  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> => {
    if (ready === null) {
      ready = applyMigrations(client, [
        { id: "0005_class_rosters", sql: ROSTER_DDL },
      ]).then(() => undefined);
    }
    return ready;
  };
  return {
    async save(teacherId, tenantId, names) {
      await ensure();
      const kept = [...names].slice(0, MAX_NAMES);
      if (kept.length === 0) {
        await client.query("delete from intel.class_rosters where teacher_id = $1", [
          teacherId,
        ]);
        return;
      }
      await client.query(
        `insert into intel.class_rosters (teacher_id, tenant_id, names)
         values ($1, $2, $3::jsonb)
         on conflict (teacher_id) do update set names = excluded.names`,
        [teacherId, tenantId, JSON.stringify(kept)],
      );
    },
    async get(teacherId) {
      await ensure();
      const { rows } = await client.query<{ names: string[] }>(
        "select names from intel.class_rosters where teacher_id = $1",
        [teacherId],
      );
      return rows[0]?.names ?? [];
    },
    async allNames() {
      await ensure();
      const { rows } = await client.query<{ names: string[] }>(
        "select names from intel.class_rosters",
      );
      return [...new Set(rows.flatMap((r) => r.names))];
    },
  };
}

let storePromise: Promise<RosterStore> | null = null;
function store(): Promise<RosterStore> {
  if (storePromise === null) {
    const url = process.env.DATABASE_URL ?? "";
    const usePostgres =
      process.env.WORLD_BACKEND === "postgres" || url.length > 0;
    storePromise = Promise.resolve(
      usePostgres ? createPgRosterStore(createPgClient(url)) : createMemoryRosterStore(),
    );
  }
  return storePromise;
}

export async function saveRoster(
  teacherId: string,
  tenantId: string,
  names: readonly string[],
): Promise<void> {
  await (await store()).save(teacherId, tenantId, names);
  // Refresh the redaction snapshot so the new names are stripped on the very next
  // model call, without waiting for a restart.
  await refreshRosterRedactionTerms();
}

export async function getRoster(teacherId: string): Promise<string[]> {
  return (await store()).get(teacherId);
}

/**
 * Every registered roster name across all teachers, expanded to redaction terms.
 * Synchronous callers (the adapter's per-call resolver) read a cached snapshot
 * that this refreshes; the cache starts empty and fills on first load.
 */
let snapshot: string[] = [];
export async function refreshRosterRedactionTerms(): Promise<string[]> {
  snapshot = redactionTermsFor(await (await store()).allNames());
  return snapshot;
}

/** The last-refreshed redaction terms — fed into the adapter's live PII resolver. */
export function rosterRedactionTerms(): readonly string[] {
  return snapshot;
}

/** For tests: swap the store and reset the cached snapshot. */
export function __setRosterStoreForTest(next: RosterStore | null): void {
  storePromise = next === null ? null : Promise.resolve(next);
  snapshot = [];
}
