import { runIdempotent, type SqlClient } from "./client";

/**
 * The Postgres schema the frozen domain conforms to (the DB conforms to the
 * domain, never the reverse). snake_case tables, text PKs holding the domain's
 * opaque ids, a jsonb `data` column carrying the full aggregate, and a
 * `created_at` written from the INJECTED clock at save time — never a DB now()
 * default, so a fixed clock yields deterministic rows. A monotonic `seq` gives
 * insertion order without depending on the clock.
 *
 * Every row carries tenant_id (school) and an owner scope (student_id/class_id/
 * skill_id) ahead of P12's row-level security. Affect lives in a PHYSICALLY
 * separate schema (`emotional`) from the academic tables so a stricter policy
 * can be applied to it later.
 */
export const SCHEMA_SQL = `
create schema if not exists academic;
create schema if not exists emotional;
create schema if not exists pilot;
create schema if not exists safety;

-- Crisis escalations (P16). The RLS grant + counselor policy are applied in
-- rls.ts; the table itself lives here so migrations alone (no applyRls) create it.
create table if not exists safety.crisis_escalations (
  id text primary key,
  student_id text not null,
  tenant_id text not null,
  tier text not null,
  text_ref text not null,
  detector_version text not null,
  created_at timestamptz not null,
  delivered_to jsonb not null default '[]'::jsonb,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text,
  undelivered boolean not null default false,
  attempts integer not null default 0,
  last_attempt_at timestamptz
);

-- Pilot metadata (P15/P17). SERVICE-ROLE ONLY: never granted to authenticated, so
-- these are unreachable from any signed-in surface. Events carry PSEUDONYMS; the
-- real<->pseudonym mapping lives only in pilot.pseudonyms.
create table if not exists pilot.events (
  seq bigserial primary key,
  tenant_id text not null,
  data jsonb not null,
  created_at timestamptz not null
);

create table if not exists pilot.pseudonyms (
  real_id text primary key,
  pseudonym text not null,
  created_at timestamptz not null
);

-- LLM shadow-render harvest (p6): deterministic-vs-LLM renders for the golden set.
-- Template + slots only (teacher exam text + skill), never student free text.
create table if not exists pilot.shadow_renders (
  seq bigserial primary key,
  template text not null,
  slots jsonb not null,
  deterministic text not null,
  llm text not null,
  agreed boolean not null,
  created_at timestamptz not null
);

create table if not exists academic.assessments (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  class_id text,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.goals (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  assessment_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.outcomes (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  assessment_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.reflections (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  assessment_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.transfer_probes (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  assessment_id text not null,
  skill_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.learning_maps (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  skill_id text not null,
  student_id text,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.canonical_evidence (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  provider_id text not null,
  student_id text not null,
  schema_version integer not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.field_maps (
  provider_id text primary key,
  tenant_id text not null default 'tenant-default',
  mappings jsonb not null,
  status text not null,
  created_at timestamptz not null
);

create table if not exists academic.imported_grades (
  student_id text not null,
  assessment_ref text not null,
  tenant_id text not null default 'tenant-default',
  data jsonb not null,
  created_at timestamptz not null,
  primary key (student_id, assessment_ref)
);

create table if not exists academic.consent_records (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.deletion_receipts (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.flag_acknowledgements (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  teacher_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists emotional.emotion_vocabularies (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  data jsonb not null,
  created_at timestamptz not null
);

create table if not exists emotional.affect_snapshots (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  assessment_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);
`;

const ALL_TABLES = [
  "academic.assessments",
  "academic.goals",
  "academic.outcomes",
  "academic.reflections",
  "academic.transfer_probes",
  "academic.learning_maps",
  "academic.canonical_evidence",
  "academic.field_maps",
  "academic.consent_records",
  "academic.deletion_receipts",
  "academic.flag_acknowledgements",
  "emotional.emotion_vocabularies",
  "emotional.affect_snapshots",
  // Note: pilot.*, safety.crisis_escalations, and academic.imported_grades are
  // deliberately NOT truncated here — their own suites use idempotent unique-key
  // inserts, and truncating them would race with the RLS suite's seeds.
] as const;

/** Applies the schema. Idempotent (every statement is `if not exists`). */
export async function runMigrations(client: SqlClient): Promise<void> {
  await runIdempotent(async () => {
    await client.query(SCHEMA_SQL);
  });
}

/** Truncates every table — for test isolation, never production. */
export async function truncateAll(client: SqlClient): Promise<void> {
  await client.query(
    `truncate ${ALL_TABLES.join(", ")} restart identity`,
  );
}
