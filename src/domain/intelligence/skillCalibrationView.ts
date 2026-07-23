import { type Id } from "../common";
import type { CalibrationRecord } from "./calibrationModel";
import { ALIGNMENT_EPS, type TrendDirection } from "./metacognition";

/**
 * The READ side of the skill-tag calibration model (brief §2). The records are already
 * computed and stored (calibrationSync). Here we fold them into two calm, task-focused
 * views: per skill, how a STUDENT's self-judgment has lined up with their work over
 * time, and — for one lesson — how a CLASS as a whole over- or under-estimated itself.
 *
 * Neither view is a grade, a trait, or a red/green verdict; a signed delta only OPENS
 * the read ("your sense ran ahead of the work here"), it never ranks a student or names
 * one (CLAUDE.md → congruence is a flag, feedback is task-focused).
 *
 * Pure domain: deterministic folds only, no adapter/UI/model imports. `TrendDirection`
 * and its tolerance style are REUSED from metacognition — no parallel enum.
 */

/**
 * One skill on a student's timeline: how their self-judgment on it has tracked their
 * results. `latestDelta` is the signed gap (claim − demonstrated) of the most recent
 * graded record (>0 they felt surer than the work showed, <0 they did better than they
 * felt), or null while nothing on the skill is graded. `direction` reads the graded
 * series over time (is the gap shrinking, growing, or steady?).
 */
export interface StudentSkillCalibration {
  skillId: Id;
  label: string;
  /** Signed gap of the most-recent graded record, or null when none is graded. */
  latestDelta: number | null;
  /** Whether the gap is converging, diverging, steady, or too short to say. */
  direction: TrendDirection;
  /** How many records the skill has (graded or not). */
  count: number;
}

/**
 * One skill across a lesson's whole class: the signed mean of every graded student's
 * gap on it. `meanDelta` > 0 means the class as a whole felt surer than the work showed
 * (over-estimated); < 0 means it sold itself short (under-estimated); null when no
 * student on the skill is graded yet. `studentCount` is a headcount only — no names.
 */
export interface ClassSkillCalibration {
  skillId: Id;
  label: string;
  /** Signed mean of the non-null deltas, or null when none is graded. */
  meanDelta: number | null;
  /** Distinct students who have a record on this skill for the lesson. */
  studentCount: number;
}

/** Records with a non-null delta, oldest first — the graded series a trend runs over. */
function gradedByTime(
  records: readonly CalibrationRecord[],
): (CalibrationRecord & { delta: number })[] {
  return records
    .filter((r): r is CalibrationRecord & { delta: number } => r.delta !== null)
    .sort((a, b) => a.computedAt.getTime() - b.computedAt.getTime());
}

/**
 * The longitudinal per-skill read for ONE student. Groups the student's records by
 * skill; for each skill it reports the latest graded gap and whether that gap has been
 * converging or diverging over time. Skills with only ungraded records still appear
 * (latestDelta null, "insufficient"). Mirrors `metacognitiveTrend`: fewer than two
 * graded points is `insufficient` (trajectory over a single judgment is never
 * asserted), and the first gap's magnitude is compared to the last within `eps`.
 */
export function summariseStudentSkillCalibration(
  records: readonly CalibrationRecord[],
  labelFor: (skillId: Id) => string,
  eps: number = ALIGNMENT_EPS,
): StudentSkillCalibration[] {
  const bySkill = new Map<Id, CalibrationRecord[]>();
  for (const record of records) {
    const list = bySkill.get(record.skillId) ?? [];
    list.push(record);
    bySkill.set(record.skillId, list);
  }

  const out: StudentSkillCalibration[] = [];
  for (const [skillId, skillRecords] of bySkill) {
    const graded = gradedByTime(skillRecords);
    const latestDelta =
      graded.length === 0 ? null : graded[graded.length - 1].delta;

    let direction: TrendDirection;
    if (graded.length < 2) {
      direction = "insufficient";
    } else {
      const first = Math.abs(graded[0].delta);
      const last = Math.abs(graded[graded.length - 1].delta);
      const change = last - first;
      direction =
        Math.abs(change) <= eps ? "steady" : change < 0 ? "converging" : "diverging";
    }

    out.push({
      skillId,
      label: labelFor(skillId),
      latestDelta,
      direction,
      count: skillRecords.length,
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * The class-level per-skill read for ONE lesson. The input is EVERY student's records
 * for that lesson; this groups them by skill and reports, per skill, the signed mean of
 * the graded gaps (which way and how far the class as a whole missed) and a headcount.
 * Sorted by the biggest miscalibration first (descending |meanDelta|); skills with no
 * graded record sort last. Aggregate only — no student is named or ordered.
 */
export function summariseClassSkillCalibration(
  records: readonly CalibrationRecord[],
  labelFor: (skillId: Id) => string,
): ClassSkillCalibration[] {
  const bySkill = new Map<Id, CalibrationRecord[]>();
  for (const record of records) {
    const list = bySkill.get(record.skillId) ?? [];
    list.push(record);
    bySkill.set(record.skillId, list);
  }

  const out: ClassSkillCalibration[] = [];
  for (const [skillId, skillRecords] of bySkill) {
    const deltas = skillRecords
      .map((r) => r.delta)
      .filter((d): d is number => d !== null);
    const meanDelta =
      deltas.length === 0
        ? null
        : deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const studentCount = new Set(skillRecords.map((r) => r.studentId)).size;
    out.push({ skillId, label: labelFor(skillId), meanDelta, studentCount });
  }

  // Biggest miscalibration first; ungraded (null) skills sort last, then by label.
  out.sort((a, b) => {
    const am = a.meanDelta === null ? -1 : Math.abs(a.meanDelta);
    const bm = b.meanDelta === null ? -1 : Math.abs(b.meanDelta);
    if (bm !== am) return bm - am;
    return a.label.localeCompare(b.label);
  });
  return out;
}
