import type { Id } from "@/domain";

/**
 * Teacher identity constants and display helpers. The old prediction-based teacher
 * signals world was retired with the pre-assessment mechanic; the teacher surface
 * is now the reflection brief (see teacherReflectionActions). Only the seeded
 * teacher's identity and the name-formatting helper survive here.
 */

export const TEACHER_ID = "teacher-1";
export const TEACHER_NAME = "Ms. Rivera";

/** "student-avery" → "Avery". Names are formatted, never institutional ids. */
export function studentDisplayName(id: Id): string {
  const raw = id.replace(/^student-/, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
