import type { Id } from "./common";

/**
 * A teacher's acknowledgement of an agent flag. The agent raises a flag to the
 * teacher (as an ally) on a severe or persistent gap; once the teacher
 * acknowledges it, that acknowledgement feeds back into the observation so the
 * agent stops re-raising the same flag. There is exactly one standing flag per
 * student, keyed by `flagIdFor`.
 */
export interface FlagAcknowledgement {
  flagId: Id;
  teacherId: Id;
  at: Date;
}

/** The stable id of the standing flag for a student. */
export function flagIdFor(studentId: Id): Id {
  return `flag-${studentId}`;
}
