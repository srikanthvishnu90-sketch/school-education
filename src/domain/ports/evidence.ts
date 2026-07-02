import type { Id } from "../common";

/**
 * EvidenceSource — the driven port external grade evidence walks in through
 * (a gradebook / LMS export; today only a mock implements it). "Provide
 * evidence" means reconciling against REAL recorded performance, not
 * self-report (CLAUDE.md → Purpose).
 *
 * Records are RAW and untrusted: shaped like real gradebook rows —
 * assignment-level totals with no item detail, missing skill tags, revised or
 * late grades, partial rows. Every field that a messy export can omit is
 * optional here. The normalizer (adapter side) validates each record through a
 * Zod boundary and QUARANTINES what cannot be repaired; nothing downstream may
 * assume a raw record is well-formed.
 */

export interface RawGradeItem {
  /** External item identifier; missing on some exports. */
  itemRef?: string;
  /** External skill/standard tag; frequently missing. */
  skillTag?: string;
  prompt?: string;
  /** Item-level correctness; often absent (points-only gradebooks). */
  correct?: boolean;
  pointsAwarded?: number;
  maxPoints?: number;
}

export interface RawGradeRecord {
  /** The gradebook row id, when the source has one. */
  externalId?: string;
  studentId?: string;
  assessmentRef?: string;
  assessmentTitle?: string;
  /** Assignment-level total — often the ONLY score detail a gradebook has. */
  totalScore?: number;
  totalMax?: number;
  /** When the grade was recorded; sources emit strings as often as dates. */
  recordedAt?: string | Date;
  /** Revision counter; a revised grade re-emits the row with a higher revision. */
  revision?: number;
  /** e.g. "final" | "late" | "revised". Informational only. */
  status?: string;
  /** Item-level detail; absent for total-only rows. */
  items?: RawGradeItem[];
}

export interface EvidenceSource {
  /**
   * All grade records for a student, optionally only those recorded strictly
   * after `since`. Records whose `recordedAt` cannot be parsed are still
   * returned — deciding their fate is the normalizer's job, not the source's.
   */
  pull(studentId: Id, since?: Date): Promise<RawGradeRecord[]>;
}
