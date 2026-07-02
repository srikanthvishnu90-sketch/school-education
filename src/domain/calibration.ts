import type { Id } from "./common";
import { calibrationRecordSchema } from "./schemas/academic";

/**
 * CalibrationRecord → the stored result of comparing confidence to correctness.
 *
 * This is the SHAPE only. The math (brier / bias / resolution) belongs to the
 * calibration engine in P3 — see CLAUDE.md → "AI = labor, not judgment"
 * (calibration is computed deterministically, never by an LLM). We keep the
 * record type here so the repository port can reference it now.
 */
export interface CalibrationRecord {
  id: Id;
  assessmentId: Id;
  studentId: Id;
  brier: number;
  bias: number;
  resolution: number;
  itemCount: number;
  computedAt: Date;
}

/** Validates the record shape. Does NOT compute anything (that is P3). */
export function createCalibrationRecord(
  input: CalibrationRecord,
): CalibrationRecord {
  return Object.freeze(calibrationRecordSchema.parse(input));
}
