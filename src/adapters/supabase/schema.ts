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

-- Pilot metadata (P15/P17). SERVICE-ROLE ONLY: never granted to authenticated, so
-- these are unreachable from any signed-in surface. Events carry PSEUDONYMS; the
-- real<->pseudonym mapping lives only in pilot.pseudonyms.
create table if not exists pilot.events (
  seq bigserial primary key,
  tenant_id text not null,
  data jsonb not null,
  created_at timestamptz not null
);

create table if not exists pilot.response_quality (
  session_id text primary key,
  student_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists pilot.pseudonyms (
  real_id text primary key,
  pseudonym text not null,
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

create table if not exists academic.predictions (
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

create table if not exists academic.calibration_records (
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

create table if not exists academic.action_verifications (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  student_id text not null,
  target_skill_id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  seq bigserial
);

create table if not exists academic.cohort_assignments (
  id text primary key,
  tenant_id text not null default 'tenant-default',
  class_id text,
  started_at timestamptz not null,
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
  "academic.predictions",
  "academic.outcomes",
  "academic.reflections",
  "academic.calibration_records",
  "academic.transfer_probes",
  "academic.learning_maps",
  "academic.action_verifications",
  "academic.cohort_assignments",
  "academic.canonical_evidence",
  "academic.imported_grades",
  "academic.field_maps",
  "academic.consent_records",
  "academic.deletion_receipts",
  "academic.flag_acknowledgements",
  "emotional.emotion_vocabularies",
  "emotional.affect_snapshots",
  "pilot.events",
  "pilot.response_quality",
  "pilot.pseudonyms",
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
