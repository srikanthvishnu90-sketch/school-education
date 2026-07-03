import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyRls,
  createAuthenticatedClient,
  createPgClient,
  runMigrations,
  type AuthClaims,
  type PoolClient,
} from "@/adapters/supabase";

/**
 * The decentralization thesis, proven at the DATABASE. Every forbidden access is
 * attempted AS the signed-in role (a non-superuser `authenticated` connection
 * with JWT claims) and must return zero rows or error — not because the app
 * filtered it, but because row-level security did.
 */

const DB = process.env.TEST_DATABASE_URL;
const suite = DB ? describe : describe.skip;

// Connect as the non-superuser `authenticated` role so RLS is genuinely enforced.
const AUTH_DB = (DB ?? "").replace(
  /\/\/[^@/]+@/,
  "//authenticated:plumb_authenticated@",
);

const AS: Record<string, AuthClaims> = {
  studentA: { sub: "stu-A", user_role: "student", tenant_id: "school-1" },
  studentC: { sub: "stu-C", user_role: "student", tenant_id: "school-2" },
  teacher: { sub: "tea-1", user_role: "teacher", tenant_id: "school-1" },
  admin: { sub: "adm-1", user_role: "school_admin", tenant_id: "school-1" },
};

suite("RLS policies — forbidden access fails at the database", () => {
  let service: PoolClient;

  async function idsAs(
    claims: AuthClaims,
    sql: string,
    params: unknown[] = [],
  ): Promise<string[]> {
    const client = await createAuthenticatedClient(AUTH_DB, claims);
    try {
      const { rows } = await client.query<{ id: string }>(sql, params);
      return rows.map((r) => r.id);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    service = createPgClient(DB as string);
    await runMigrations(service);
    await applyRls(service);
    await service.query(
      "truncate academic.predictions, academic.reflections, academic.cohort_reports, " +
        "emotional.affect_snapshots, app.class_enrollments, app.class_teachers restart identity",
    );
    // Seeded as the service role (superuser bypasses RLS). Two schools; class-1
    // has students A and B; teacher tea-1 teaches class-1; student C is school-2.
    await service.query(
      `insert into academic.predictions (id, tenant_id, student_id, assessment_id, data, created_at) values
        ('pred-A','school-1','stu-A','a1','{}','2026-01-01'),
        ('pred-B','school-1','stu-B','a1','{}','2026-01-01'),
        ('pred-C','school-2','stu-C','a1','{}','2026-01-01')`,
    );
    await service.query(
      `insert into academic.reflections (id, tenant_id, student_id, assessment_id, data, created_at)
       values ('ref-A','school-1','stu-A','a1','{}','2026-01-01')`,
    );
    await service.query(
      `insert into emotional.affect_snapshots (id, tenant_id, student_id, assessment_id, data, created_at)
       values ('aff-A','school-1','stu-A','a1','{}','2026-01-01')`,
    );
    await service.query(
      `insert into academic.cohort_reports (id, tenant_id, cohort_id, data, created_at) values
        ('rep-1','school-1','cohort-1','{}','2026-01-01'),
        ('rep-2','school-2','cohort-2','{}','2026-01-01')`,
    );
    await service.query(
      `insert into app.class_enrollments (student_id, class_id, tenant_id) values
        ('stu-A','class-1','school-1'),('stu-B','class-1','school-1'),('stu-C','class-2','school-2')`,
    );
    await service.query(
      `insert into app.class_teachers (teacher_id, class_id, tenant_id) values ('tea-1','class-1','school-1')`,
    );
  });

  afterAll(async () => {
    await service.end();
  });

  it("student reads own rows, and CANNOT fetch another student's", async () => {
    expect(await idsAs(AS.studentA, "select id from academic.predictions")).toEqual([
      "pred-A",
    ]);
    expect(
      await idsAs(AS.studentA, "select id from academic.predictions where id = $1", [
        "pred-B",
      ]),
    ).toEqual([]);
  });

  it("no role crosses tenant", async () => {
    expect(
      await idsAs(AS.studentA, "select id from academic.predictions where id = $1", [
        "pred-C",
      ]),
    ).toEqual([]);
    expect(
      await idsAs(AS.studentC, "select id from academic.predictions where id = $1", [
        "pred-A",
      ]),
    ).toEqual([]);
    expect(await idsAs(AS.teacher, "select id from academic.cohort_reports")).toEqual(
      [],
    );
  });

  it("teacher reads academic aggregates for own class — NEVER reflections or affect", async () => {
    expect(
      await idsAs(AS.teacher, "select id from academic.predictions order by id"),
    ).toEqual(["pred-A", "pred-B"]);
    expect(await idsAs(AS.teacher, "select id from academic.reflections")).toEqual([]);
    expect(
      await idsAs(AS.teacher, "select id from emotional.affect_snapshots"),
    ).toEqual([]);
    // A student outside the teacher's class is invisible even in the same reach.
    expect(
      await idsAs(AS.teacher, "select id from academic.predictions where id = $1", [
        "pred-C",
      ]),
    ).toEqual([]);
  });

  it("school_admin reads cohort aggregates only — zero student rows, zero affect", async () => {
    expect(await idsAs(AS.admin, "select id from academic.cohort_reports")).toEqual([
      "rep-1",
    ]);
    expect(await idsAs(AS.admin, "select id from academic.predictions")).toEqual([]);
    expect(await idsAs(AS.admin, "select id from academic.reflections")).toEqual([]);
    expect(
      await idsAs(AS.admin, "select id from emotional.affect_snapshots"),
    ).toEqual([]);
  });

  it("no service-role leak: authenticated cannot disable the policies", async () => {
    const client = await createAuthenticatedClient(AUTH_DB, AS.studentA);
    try {
      await expect(
        client.query("alter table academic.predictions disable row level security"),
      ).rejects.toBeTruthy();
    } finally {
      await client.end();
    }
  });
});
