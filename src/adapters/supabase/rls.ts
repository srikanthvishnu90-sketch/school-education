import { runIdempotent, type SqlClient } from "./client";

/**
 * Row-level security — the decentralization thesis made structural. "Data flows
 * to the student" stops being a convention and becomes a database policy no app
 * bug can bypass. Every app user connects as the `authenticated` Postgres role;
 * WHO they are (id, app role, tenant) rides in the JWT claims, read here through
 * app.uid()/app.role()/app.tenant(). The service role (the composition root's
 * superuser connection) bypasses RLS and is the only writer of shared rows.
 *
 * The rules:
 *   · student      — full read/write on their OWN rows only.
 *   · teacher      — read academic AGGREGATES for their own classes only; NEVER
 *                    reflections' free text or affect (no policy → no access).
 *   · school_admin — cohort-level aggregates only; zero row-level student access,
 *                    zero affect access.
 *   · counselor    — crisis escalations for their tenant ONLY (P16); nothing else —
 *                    no predictions, reflections, affect, or aggregates.
 *   · no role ever crosses tenant_id.
 */
export const RLS_SQL = `
create schema if not exists app;
grant usage on schema safety to authenticated;
-- The crisis_escalations TABLE is created by runMigrations (schema.ts); here we
-- only grant + policy it. Readable ONLY by the tenant's designated counselor.
grant select on safety.crisis_escalations to authenticated;

-- The application role every signed-in user connects as (Supabase's convention).
-- Given a login + password here so tests connect AS this non-superuser role,
-- making RLS genuinely enforced (a superuser SET ROLE would still bypass it).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated login password 'plumb_authenticated';
  end if;
end $$;
alter role authenticated login password 'plumb_authenticated';

grant usage on schema academic, emotional, app to authenticated;
grant select, insert, update, delete on all tables in schema academic to authenticated;
grant select, insert, update, delete on all tables in schema emotional to authenticated;
grant select on all tables in schema app to authenticated;
grant usage, select on all sequences in schema academic to authenticated;
grant usage, select on all sequences in schema emotional to authenticated;

-- Identity from the request JWT claims (set per request by the app; empty for none).
create or replace function app.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function app.uid() returns text language sql stable as $$ select app.jwt()->>'sub' $$;
create or replace function app.role() returns text language sql stable as $$ select app.jwt()->>'user_role' $$;
create or replace function app.tenant() returns text language sql stable as $$ select app.jwt()->>'tenant_id' $$;

-- Tenancy: which class a student is in, which classes a teacher teaches.
create table if not exists app.class_enrollments (
  student_id text not null,
  class_id text not null,
  tenant_id text not null,
  primary key (student_id, class_id)
);
create table if not exists app.class_teachers (
  teacher_id text not null,
  class_id text not null,
  tenant_id text not null,
  primary key (teacher_id, class_id)
);

-- Cohort aggregate outputs (P9) — the ONLY thing a school_admin may read.
create table if not exists academic.cohort_reports (
  id text primary key,
  tenant_id text not null,
  cohort_id text not null,
  data jsonb not null,
  created_at timestamptz not null
);
grant select, insert on academic.cohort_reports to authenticated;

-- Predicates, so the policies read as their intent.
create or replace function app.student_owns(p_student text, p_tenant text)
  returns boolean language sql stable as $$
  select app.role() = 'student' and p_student = app.uid() and p_tenant = app.tenant()
$$;

-- SECURITY DEFINER so the policy can consult the roster without granting the
-- authenticated role direct read on it. search_path pinned against hijacking.
create or replace function app.teacher_sees(p_student text, p_tenant text)
  returns boolean language sql stable security definer set search_path = app, pg_temp as $$
  select app.role() = 'teacher'
    and p_tenant = app.tenant()
    and exists (
      select 1
      from app.class_enrollments e
      join app.class_teachers t
        on t.class_id = e.class_id and t.tenant_id = e.tenant_id
      where e.student_id = p_student
        and t.teacher_id = app.uid()
        and e.tenant_id = app.tenant()
    )
$$;
`;

/** Per-table policy statements, generated so every table follows the same rules. */
function tablePolicies(): string {
  const out: string[] = [];

  // Per-student tables a TEACHER may read as aggregates (never free text).
  const teacherReadable = [
    "academic.goals",
    "academic.outcomes",
  ];
  // Per-student tables NO teacher/admin may ever read (free text, affect, and the
  // student's own imported-grade record).
  const studentOnly = [
    "academic.reflections",
    "academic.consent_records",
    "academic.deletion_receipts",
    "academic.imported_grades",
    "emotional.affect_snapshots",
  ];
  // Shared, tenant-scoped reference data every member may read.
  const shared = [
    "academic.assessments",
    "academic.learning_maps",
    "academic.transfer_probes",
    "emotional.emotion_vocabularies",
  ];

  const enable = (t: string): string =>
    `alter table ${t} enable row level security;`;
  const drop = (t: string, name: string): string =>
    `drop policy if exists ${name} on ${t};`;

  for (const t of [...teacherReadable, ...studentOnly]) {
    out.push(enable(t));
    out.push(drop(t, "student_all"));
    out.push(
      `create policy student_all on ${t} for all to authenticated ` +
        `using (app.student_owns(student_id, tenant_id)) ` +
        `with check (app.student_owns(student_id, tenant_id));`,
    );
  }
  for (const t of teacherReadable) {
    out.push(drop(t, "teacher_read"));
    out.push(
      `create policy teacher_read on ${t} for select to authenticated ` +
        `using (app.teacher_sees(student_id, tenant_id));`,
    );
  }
  for (const t of shared) {
    out.push(enable(t));
    out.push(drop(t, "member_read"));
    out.push(
      `create policy member_read on ${t} for select to authenticated ` +
        `using (tenant_id = app.tenant() and app.role() in ('student','teacher'));`,
    );
    out.push(drop(t, "member_write"));
    // Students write their own transfer probes / etc. only within their tenant;
    // shared reference rows are written by the service role (RLS-bypassing).
    out.push(
      `create policy member_write on ${t} for insert to authenticated ` +
        `with check (tenant_id = app.tenant() and app.role() = 'student');`,
    );
  }

  // school_admin: cohort aggregates only, tenant-scoped. No per-student access.
  out.push(enable("academic.cohort_reports"));
  out.push(drop("academic.cohort_reports", "admin_read"));
  out.push(
    `create policy admin_read on academic.cohort_reports for select to authenticated ` +
      `using (app.role() = 'school_admin' and tenant_id = app.tenant());`,
  );

  // counselor: crisis escalations for their tenant ONLY (P16). No other role has a
  // policy on this table, so teacher/admin/student can never read it; and the
  // counselor role appears in no other policy, so it can read nothing else.
  out.push(enable("safety.crisis_escalations"));
  out.push(drop("safety.crisis_escalations", "counselor_read"));
  out.push(
    `create policy counselor_read on safety.crisis_escalations for select to authenticated ` +
      `using (app.role() = 'counselor' and tenant_id = app.tenant());`,
  );

  return out.join("\n");
}

/** Applies RLS. Idempotent (roles guarded, functions replaced, policies dropped-then-created). */
export async function applyRls(client: SqlClient): Promise<void> {
  await runIdempotent(async () => {
    await client.query(RLS_SQL);
    await client.query(tablePolicies());
  });
}
