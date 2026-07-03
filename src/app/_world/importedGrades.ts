import type { CanonicalEvidence } from "@/domain";

/**
 * A tiny store for gradebook grades imported through /ingest (p7). These are
 * TEACHER-RECORDED evidence, shown to the student as their own record — kept
 * DELIBERATELY separate from the belief↔reality prediction trajectory, so an
 * external grade can never be mistaken for (or game) the self-prediction story.
 * In-memory and process-lifetime; a real deployment persists these.
 */

export interface ImportedGradeStore {
  /** Add accepted grades; idempotent per (studentId, assessmentRef) — latest wins. */
  add(grades: readonly CanonicalEvidence[]): void;
  listByStudent(studentId: string): CanonicalEvidence[];
}

export function createImportedGradeStore(): ImportedGradeStore {
  // Keyed by studentId -> assessmentRef -> evidence, so a re-upload replaces
  // rather than duplicates (revised grades overwrite).
  const byStudent = new Map<string, Map<string, CanonicalEvidence>>();
  return {
    add(grades) {
      for (const g of grades) {
        const forStudent = byStudent.get(g.studentId) ?? new Map();
        forStudent.set(g.assessmentRef, g);
        byStudent.set(g.studentId, forStudent);
      }
    },
    listByStudent(studentId) {
      return [...(byStudent.get(studentId)?.values() ?? [])];
    },
  };
}
