import { describe, expect, it } from "vitest";

import type { CalibrationRecord } from "@/domain/intelligence/calibrationModel";
import {
  summariseClassSkillCalibration,
  summariseStudentSkillCalibration,
} from "@/domain/intelligence/skillCalibrationView";

/** Build a calibration record with sensible defaults, overriding what a test cares about. */
function rec(over: Partial<CalibrationRecord> & { id: string }): CalibrationRecord {
  return {
    studentId: "stu-1",
    skillId: "skill-a",
    lessonId: "lesson-1",
    claimedConfidence: 0.8,
    demonstrated: 0.8,
    delta: 0,
    computedAt: new Date("2026-05-01T10:00:00.000Z"),
    ...over,
  };
}

/** A label map that just uppercases the id's tail, so ordering is testable. */
const LABELS: Record<string, string> = {
  "skill-a": "Adding fractions",
  "skill-b": "Borrowing in subtraction",
  "skill-c": "Comparing decimals",
};
const labelFor = (id: string): string => LABELS[id] ?? id;

describe("summariseStudentSkillCalibration", () => {
  it("groups by skill, sorts by label, and counts every record", () => {
    const out = summariseStudentSkillCalibration(
      [
        rec({ id: "1", skillId: "skill-b" }),
        rec({ id: "2", skillId: "skill-a" }),
        rec({ id: "3", skillId: "skill-a" }),
      ],
      labelFor,
    );
    expect(out.map((s) => s.label)).toEqual(["Adding fractions", "Borrowing in subtraction"]);
    expect(out[0].count).toBe(2);
    expect(out[1].count).toBe(1);
  });

  it("takes latestDelta from the most-recent graded record, skipping ungraded", () => {
    const out = summariseStudentSkillCalibration(
      [
        rec({
          id: "1",
          delta: 0.3,
          computedAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
        rec({
          id: "2",
          delta: 0.1,
          computedAt: new Date("2026-05-03T00:00:00.000Z"),
        }),
        // Newest by time but ungraded — must NOT become latestDelta.
        rec({
          id: "3",
          delta: null,
          demonstrated: null,
          computedAt: new Date("2026-05-05T00:00:00.000Z"),
        }),
      ],
      labelFor,
    );
    expect(out).toHaveLength(1);
    expect(out[0].latestDelta).toBe(0.1);
  });

  it("reports converging when the gap magnitude shrinks over time", () => {
    const out = summariseStudentSkillCalibration(
      [
        rec({ id: "1", delta: 0.5, computedAt: new Date("2026-05-01T00:00:00.000Z") }),
        rec({ id: "2", delta: 0.05, computedAt: new Date("2026-05-04T00:00:00.000Z") }),
      ],
      labelFor,
    );
    expect(out[0].direction).toBe("converging");
  });

  it("reports diverging when the gap magnitude grows over time", () => {
    const out = summariseStudentSkillCalibration(
      [
        rec({ id: "1", delta: 0.05, computedAt: new Date("2026-05-01T00:00:00.000Z") }),
        rec({ id: "2", delta: -0.5, computedAt: new Date("2026-05-04T00:00:00.000Z") }),
      ],
      labelFor,
    );
    expect(out[0].direction).toBe("diverging");
  });

  it("reports steady when the first and last magnitudes are within tolerance", () => {
    const out = summariseStudentSkillCalibration(
      [
        rec({ id: "1", delta: 0.2, computedAt: new Date("2026-05-01T00:00:00.000Z") }),
        rec({ id: "2", delta: -0.25, computedAt: new Date("2026-05-04T00:00:00.000Z") }),
      ],
      labelFor,
    );
    expect(out[0].direction).toBe("steady");
  });

  it("is insufficient with fewer than two graded points, and appears with null delta when only ungraded", () => {
    const out = summariseStudentSkillCalibration(
      [rec({ id: "1", delta: null, demonstrated: null })],
      labelFor,
    );
    expect(out).toHaveLength(1);
    expect(out[0].latestDelta).toBeNull();
    expect(out[0].direction).toBe("insufficient");
    expect(out[0].count).toBe(1);
  });

  it("falls back to the raw skillId when no label is provided", () => {
    const out = summariseStudentSkillCalibration(
      [rec({ id: "1", skillId: "skill-unknown" })],
      (id) => id,
    );
    expect(out[0].label).toBe("skill-unknown");
  });
});

describe("summariseClassSkillCalibration", () => {
  it("takes the signed mean of graded deltas per skill", () => {
    const out = summariseClassSkillCalibration(
      [
        rec({ id: "1", skillId: "skill-a", studentId: "stu-1", delta: 0.4 }),
        rec({ id: "2", skillId: "skill-a", studentId: "stu-2", delta: 0.2 }),
      ],
      labelFor,
    );
    expect(out).toHaveLength(1);
    expect(out[0].meanDelta).toBeCloseTo(0.3, 10);
    expect(out[0].studentCount).toBe(2);
  });

  it("keeps sign: a negative mean means the class under-estimated itself", () => {
    const out = summariseClassSkillCalibration(
      [
        rec({ id: "1", skillId: "skill-a", studentId: "stu-1", delta: -0.3 }),
        rec({ id: "2", skillId: "skill-a", studentId: "stu-2", delta: -0.1 }),
      ],
      labelFor,
    );
    expect(out[0].meanDelta).toBeCloseTo(-0.2, 10);
  });

  it("ignores ungraded records in the mean but null when none are graded", () => {
    const out = summariseClassSkillCalibration(
      [
        rec({ id: "1", skillId: "skill-a", studentId: "stu-1", delta: 0.4 }),
        rec({
          id: "2",
          skillId: "skill-a",
          studentId: "stu-2",
          delta: null,
          demonstrated: null,
        }),
        rec({
          id: "3",
          skillId: "skill-b",
          studentId: "stu-1",
          delta: null,
          demonstrated: null,
        }),
      ],
      labelFor,
    );
    const a = out.find((s) => s.skillId === "skill-a");
    const b = out.find((s) => s.skillId === "skill-b");
    expect(a?.meanDelta).toBeCloseTo(0.4, 10);
    expect(a?.studentCount).toBe(2);
    expect(b?.meanDelta).toBeNull();
  });

  it("sorts by descending |meanDelta| with ungraded skills last", () => {
    const out = summariseClassSkillCalibration(
      [
        rec({ id: "1", skillId: "skill-a", delta: 0.1 }),
        rec({ id: "2", skillId: "skill-b", delta: -0.6 }),
        rec({ id: "3", skillId: "skill-c", delta: null, demonstrated: null }),
      ],
      labelFor,
    );
    expect(out.map((s) => s.skillId)).toEqual(["skill-b", "skill-a", "skill-c"]);
  });
});
