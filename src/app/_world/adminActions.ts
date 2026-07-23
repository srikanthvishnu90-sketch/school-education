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
