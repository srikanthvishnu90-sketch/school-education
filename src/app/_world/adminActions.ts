"use server";

import { getSessionUser } from "./session";
import { getWorld } from "./world";
import { tenantForId } from "./credentials";
import { listAudit, type AuditEvent } from "./auditLog";
import {
  effectiveScopes,
  type ConsentGrantor,
  type ConsentRecord,
  type Id,
} from "@/domain";
import {
  taskHealthSummary,
  type TaskHealthRow,
} from "@/domain/intelligence/taskHealth";
import {
  deriveReflectionOutcome,
  readSelfConfidence,
} from "@/domain/intelligence/metacognition";
import {
  computeProgramMetrics,
  type ProgramMetrics,
  type ProgramMetricsGradedOutcome,
  type ProgramMetricsSession,
} from "@/domain/intelligence/programMetrics";

/**
 * The district-admin surface: usage for their tenant and the access audit log
 * (who saw which student's data). Everything is tenant-scoped — an admin can only
 * see their own district. Read-only; no student content is exposed here, only
 * counts and access records.
 */

const CLASS_ID = "class-1";

export interface AdminOverview {
  tenantId: string;
  usage: {
    lessons: number;
    reflectionsStarted: number;
    reflectionsCompleted: number;
    students: number;
  };
  audit: AuditEvent[];
  /** Per-task model-health from the self-throttling monitor (empty until exercised). */
  assistantHealth: TaskHealthRow[];
}

async function requireAdmin(): Promise<{ id: string; tenantId: string }> {
  const user = await getSessionUser();
  if (user === null || user.role !== "admin") {
    throw new Error("Only a district admin can view this.");
  }
  return { id: user.id, tenantId: user.tenantId };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const admin = await requireAdmin();
  const world = await getWorld();

  const lessons = (await world.intel.lessons.listByClass(CLASS_ID)).filter(
    (l) => l.tenantId === admin.tenantId,
  );
  let started = 0;
  let completed = 0;
  const students = new Set<string>();
  for (const lesson of lessons) {
    const sessions = await world.intel.sessions.listByReflection(lesson.id);
    started += sessions.length;
    for (const s of sessions) {
      students.add(s.studentId);
      if (s.status === "completed") completed += 1;
    }
  }

  return {
    tenantId: admin.tenantId,
    usage: {
      lessons: lessons.length,
      reflectionsStarted: started,
      reflectionsCompleted: completed,
      students: students.size,
    },
    audit: listAudit(admin.tenantId, 100),
    assistantHealth: taskHealthSummary(),
  };
}

/**
 * The tenant's PROGRAM METRICS — an aggregate, task-focused snapshot of engagement
 * and self-knowledge for the district-admin surface (brief D1). Same auth and tenant
 * scoping as `getAdminOverview`: admin-only, and every number is confined to the
 * admin's own district. AGGREGATE ONLY — no per-student row, no name, no reflection
 * content leaves this action, so no new access-audit entry is warranted (nothing
 * student-identifying is exposed).
 *
 * SNAPSHOT, NOT A TREND: these are computed live from the in-memory repositories.
 * A true longitudinal program view (this week vs. last, the alignment share month
 * over month) needs durable storage that survives restarts (Neon) — not provisioned
 * here — so that trend-over-time piece is deliberately DEFERRED. `note` says so.
 *
 * Denominators: participation is measured against the tenant's STANDING-CONSENT
 * roster (students currently permitted to reflect) — the closest thing to an
 * enrollment roster this world persists — while the numerator is the distinct
 * students who have actually started a reflection. Completion and alignment ride on
 * the tenant's sessions and graded reflections, joined exactly as the student/teacher
 * timelines do (performance + the in-chat self-confidence).
 */
export async function getProgramMetrics(): Promise<
  ProgramMetrics & { tenantId: string; note: string }
> {
  const admin = await requireAdmin();
  const world = await getWorld();

  // The roster-of-record: students in this tenant who currently hold reflection
  // (affect) consent, i.e. who are permitted to reflect at all. Reuses the same
  // tenant-scoped consent register the admin already sees; count only — no rows kept.
  const roster = await exportConsentRecords();
  const rosterSize = roster.records.length;

  const lessons = (await world.intel.lessons.listByClass(CLASS_ID)).filter(
    (l) => l.tenantId === admin.tenantId,
  );

  const sessionsIn: ProgramMetricsSession[] = [];
  const gradedOutcomes: ProgramMetricsGradedOutcome[] = [];
  const calibrationDeltas: number[] = [];
  const seenStudents = new Set<string>();

  for (const lesson of lessons) {
    const sessions = await world.intel.sessions.listByReflection(lesson.id);
    for (const session of sessions) {
      sessionsIn.push({ studentId: session.studentId, status: session.status });
      seenStudents.add(session.studentId);
      // Graded subset: a reflection counts as graded once a teacher score exists.
      // Alignment joins the in-chat self-confidence to that score (timeline join).
      const performance = await world.intel.performances.findByReflectionAndStudent(
        session.reflectionId,
        session.studentId,
      );
      if (performance !== null) {
        const outcome = deriveReflectionOutcome(
          performance,
          readSelfConfidence(session),
        );
        gradedOutcomes.push({ alignment: outcome.alignment });
      }
    }
  }

  // Calibration gaps: the signed deltas of every graded calibration record for the
  // tenant's students. A student belongs to one tenant, so their records are all in
  // scope; magnitudes are taken in the domain (signs never cancel).
  for (const studentId of seenStudents) {
    const records = await world.intel.calibrationRecords.listByStudent(studentId);
    for (const record of records) {
      if (record.delta !== null) calibrationDeltas.push(record.delta);
    }
  }

  const metrics = computeProgramMetrics({
    rosterSize,
    sessions: sessionsIn,
    gradedOutcomes,
    calibrationDeltas,
  });

  return {
    ...metrics,
    tenantId: admin.tenantId,
    note:
      "Current snapshot, computed live from repository data. Participation is " +
      "measured against the tenant's standing-consent roster (students permitted " +
      "to reflect). Trend over time and history across restarts need durable " +
      "storage (Neon), which is not provisioned here — that longitudinal view is " +
      "deferred.",
  };
}

/**
 * One roster-level consent record for the compliance export. It carries the
 * CONSENT LIFECYCLE only — who granted, what age basis, and when — never any
 * reflection or emotional content. `under13` is the COPPA signal: the gate only
 * lets an under-13 student reflect on a parent/guardian grant, so a "parent"
 * grantor is exactly the recorded under-13 (verifiable parental) consent, and a
 * "self" grantor is a 13-or-older student consenting for themselves.
 */
export interface ConsentExportRow {
  studentId: Id;
  under13: boolean;
  grantorType: ConsentGrantor;
  grantedAt: Date;
}

export interface ConsentExport {
  tenantId: string;
  /** One row per student in the tenant who currently holds reflection consent. */
  records: ConsentExportRow[];
}

/**
 * The tenant's consent register (COPPA/SOPPA record-keeping). Admin-only and
 * tenant-scoped: a district admin can produce the roster of who has a standing
 * consent to reflect and on what basis, so an under-13 student's parental
 * permission is auditable — WITHOUT ever exposing a single student's reflection.
 *
 * Consent is stored per student; the tenant boundary lives in the auth layer, so
 * each student's record is kept only if it resolves to the admin's own tenant.
 * Only records whose `affect` scope is currently in force are included (a revoked
 * consent drops out), and the granting record supplies the grantor + timestamp.
 */
export async function exportConsentRecords(): Promise<ConsentExport> {
  const admin = await requireAdmin();
  const world = await getWorld();
  const all = await world.repos.consent.listAll();

  // Group each student's history so effective scope and the granting record are
  // read together (grant → revoke → grant replays correctly in the domain).
  const byStudent = new Map<Id, ConsentRecord[]>();
  for (const record of all) {
    const existing = byStudent.get(record.studentId);
    if (existing === undefined) byStudent.set(record.studentId, [record]);
    else existing.push(record);
  }

  const rows: ConsentExportRow[] = [];
  for (const [studentId, records] of byStudent) {
    // Only a student who currently holds reflection (affect) consent belongs in
    // the register; a revoked consent is not a standing permission.
    if (!effectiveScopes(records).has("affect")) continue;
    // Tenant isolation: an admin sees only their own district's students.
    if ((await tenantForId(studentId)) !== admin.tenantId) continue;
    // The most recent GRANT is the standing permission-of-record.
    const grant = records
      .filter((r) => r.status === "granted")
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())[0];
    if (grant === undefined) continue;
    rows.push({
      studentId,
      under13: grant.grantorType === "parent",
      grantorType: grant.grantorType,
      grantedAt: grant.grantedAt,
    });
  }

  rows.sort((a, b) => a.studentId.localeCompare(b.studentId));
  return { tenantId: admin.tenantId, records: rows };
}
