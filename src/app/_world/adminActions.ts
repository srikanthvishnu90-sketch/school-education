"use server";

import { getSessionUser } from "./session";
import { getWorld } from "./world";
import { listAudit, type AuditEvent } from "./auditLog";
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
