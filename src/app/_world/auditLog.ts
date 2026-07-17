/**
 * Access audit log (FERPA record-of-access). Every time a staff member reads or
 * writes a student's data, it is recorded here: who, what, which student/lesson,
 * and when. It is append-only and bounded; a real deployment persists this to a
 * write-once store an auditor can export. Recording is best-effort and must never
 * block the action it observes.
 */

export type AuditAction =
  | "view_lesson"
  | "delete_lesson"
  | "view_class_brief"
  | "view_scores"
  | "record_score"
  | "view_escalations"
  | "view_escalation"
  | "erase_data";

export interface AuditEvent {
  at: string;
  /** The district this access happened in — an admin only sees their own. */
  tenantId: string;
  actorId: string;
  actorRole: string;
  action: AuditAction;
  /** The lesson/reflection touched, when relevant. */
  reflectionId?: string;
  /** The specific student whose data was touched, when relevant. */
  studentId?: string;
}

const MAX_EVENTS = 5000;
const events: AuditEvent[] = [];

export interface AuditInput {
  tenantId: string;
  actorId: string;
  actorRole: string;
  action: AuditAction;
  at: Date;
  reflectionId?: string;
  studentId?: string;
}

/** Append one access event. Never throws — auditing must not break the action. */
export function recordAudit(input: AuditInput): void {
  events.push({
    at: input.at.toISOString(),
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    ...(input.reflectionId !== undefined ? { reflectionId: input.reflectionId } : {}),
    ...(input.studentId !== undefined ? { studentId: input.studentId } : {}),
  });
  if (events.length > MAX_EVENTS) events.shift();
}

/** The most recent access events for one district, newest first (admin surface). */
export function listAudit(tenantId: string, limit = 200): AuditEvent[] {
  return events
    .filter((e) => e.tenantId === tenantId)
    .slice(-limit)
    .reverse();
}

/** Access events touching one student — the FERPA "who saw my child's record" query. */
export function auditForStudent(studentId: string): AuditEvent[] {
  return events.filter((e) => e.studentId === studentId).reverse();
}
