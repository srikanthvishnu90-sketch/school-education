import type { CanonicalEvidence } from "@/domain";
import type { Clock } from "@/domain/ports";
import type { SqlClient } from "@/adapters/supabase";

/**
 * A store for gradebook grades imported through /ingest (p7). These are
 * TEACHER-RECORDED evidence, shown to the student as their own record — kept
 * DELIBERATELY separate from the belief↔reality prediction trajectory, so an
 * external grade can never be mistaken for (or game) the self-prediction story.
 * Persistence by default: PG-backed when a database is configured, else in-memory.
 */

export interface ImportedGradeStore {
  /** Add accepted grades; idempotent per (studentId, assessmentRef) — latest wins. */
  add(grades: readonly CanonicalEvidence[]): Promise<void>;
  listByStudent(studentId: string): Promise<CanonicalEvidence[]>;
}

export function createImportedGradeStore(): ImportedGradeStore {
  // Keyed by studentId -> assessmentRef -> evidence, so a re-upload replaces
  // rather than duplicates (revised grades overwrite).
  const byStudent = new Map<string, Map<string, CanonicalEvidence>>();
  return {
    async add(grades) {
      for (const g of grades) {
        const forStudent = byStudent.get(g.studentId) ?? new Map();
        forStudent.set(g.assessmentRef, g);
        byStudent.set(g.studentId, forStudent);
      }
    },
    async listByStudent(studentId) {
      return [...(byStudent.get(studentId)?.values() ?? [])];
    },
  };
}

/** PG-backed store: grades survive restart, upserted per (student, assessment). */
export function createPgImportedGradeStore(
  client: SqlClient,
  clock: Clock,
): ImportedGradeStore {
  return {
    async add(grades) {
      for (const g of grades) {
        await client.query(
          `insert into academic.imported_grades
             (student_id, assessment_ref, data, created_at)
           values ($1, $2, $3, $4)
           on conflict (student_id, assessment_ref)
             do update set data = excluded.data, created_at = excluded.created_at`,
          [g.studentId, g.assessmentRef, JSON.stringify(g), clock.now()],
        );
      }
    },
    async listByStudent(studentId) {
      const { rows } = await client.query<{ data: CanonicalEvidence }>(
        "select data from academic.imported_grades where student_id = $1 order by assessment_ref asc",
        [studentId],
      );
      return rows.map((r) => r.data);
    },
  };
}
