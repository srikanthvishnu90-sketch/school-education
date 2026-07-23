import { describe, expect, it } from "vitest";

import {
  computeSkillCalibration,
  createCalibrationRecord,
  createEvidence,
  createSkillTag,
  skillLabelsForLesson,
  type CalibrationRecord,
} from "@/domain/intelligence/calibrationModel";
import { createLessonAnalysis } from "@/domain/intelligence/lesson";

const AT = new Date("2026-05-01T10:00:00.000Z");

function analysis(overrides: {
  topic?: string;
  objectives?: string[];
}): ReturnType<typeof createLessonAnalysis> {
  return createLessonAnalysis({
    lessonId: "lesson-1",
    topic: overrides.topic ?? "Adding fractions",
    subtopics: [],
    objectives: overrides.objectives ?? [],
    vocabulary: [],
    prerequisites: [],
    technicalSteps: [],
    misconceptions: [],
    difficultTransitions: [],
    independentApplication: [],
    emotionalPressurePoints: [],
    reflectionFocus: "independent application",
    createdAt: AT,
  });
}

describe("createSkillTag", () => {
  it("freezes a valid skill", () => {
    const skill = createSkillTag({
      id: "sk-1",
      classId: "cls-1",
      label: "Add unlike denominators",
      source: "ai_extracted",
    });
    expect(Object.isFrozen(skill)).toBe(true);
    expect(skill.standardRef).toBeUndefined();
  });

  it("rejects an empty label", () => {
    expect(() =>
      createSkillTag({
        id: "sk-1",
        classId: "cls-1",
        label: "",
        source: "ai_extracted",
      }),
    ).toThrow();
  });

  it("rejects an unknown source", () => {
    expect(() =>
      createSkillTag({
        id: "sk-1",
        classId: "cls-1",
        label: "Add",
        // @ts-expect-error bad enum on purpose
        source: "guessed",
      }),
    ).toThrow();
  });
});

describe("createEvidence", () => {
  it("accepts numeric and string values", () => {
    const score = createEvidence({
      id: "ev-1",
      studentId: "stu-1",
      lessonId: "lesson-1",
      skillId: "sk-1",
      kind: "score",
      value: 0.8,
      maxValue: 1,
    });
    expect(Object.isFrozen(score)).toBe(true);
    const answer = createEvidence({
      id: "ev-2",
      studentId: "stu-1",
      lessonId: "lesson-1",
      skillId: "sk-1",
      kind: "exit_answer",
      value: "3/4",
    });
    expect(answer.value).toBe("3/4");
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      createEvidence({
        id: "ev-1",
        studentId: "stu-1",
        lessonId: "lesson-1",
        skillId: "sk-1",
        // @ts-expect-error bad enum on purpose
        kind: "vibes",
        value: 1,
      }),
    ).toThrow();
  });
});

describe("createCalibrationRecord", () => {
  const base: CalibrationRecord = {
    id: "cal-1",
    studentId: "stu-1",
    skillId: "sk-1",
    lessonId: "lesson-1",
    claimedConfidence: 0.75,
    demonstrated: 0.5,
    delta: 0.25,
    computedAt: AT,
  };

  it("freezes a valid record", () => {
    expect(Object.isFrozen(createCalibrationRecord(base))).toBe(true);
  });

  it("allows null demonstrated/delta (ungraded)", () => {
    const rec = createCalibrationRecord({
      ...base,
      demonstrated: null,
      delta: null,
    });
    expect(rec.demonstrated).toBeNull();
    expect(rec.delta).toBeNull();
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(() =>
      createCalibrationRecord({ ...base, claimedConfidence: 1.5 }),
    ).toThrow();
    expect(() =>
      createCalibrationRecord({ ...base, claimedConfidence: -0.1 }),
    ).toThrow();
  });

  it("rejects demonstrated outside [0, 1]", () => {
    expect(() =>
      createCalibrationRecord({ ...base, demonstrated: 2 }),
    ).toThrow();
  });
});

describe("skillLabelsForLesson", () => {
  it("uses objectives when present", () => {
    expect(
      skillLabelsForLesson(
        analysis({ objectives: ["Add unlike denominators", "Simplify"] }),
      ),
    ).toEqual(["Add unlike denominators", "Simplify"]);
  });

  it("falls back to the topic when there are no objectives", () => {
    expect(
      skillLabelsForLesson(analysis({ topic: "Adding fractions" })),
    ).toEqual(["Adding fractions"]);
  });

  it("trims, drops empties, and dedupes (order preserved)", () => {
    expect(
      skillLabelsForLesson(
        analysis({
          objectives: ["  Simplify ", "Simplify", "   ", "Estimate"],
        }),
      ),
    ).toEqual(["Simplify", "Estimate"]);
  });
});

describe("computeSkillCalibration", () => {
  const common = {
    studentId: "stu-1",
    lessonId: "lesson-1",
    idFor: (skillId: string) => `cal-${skillId}`,
    computedAt: AT,
  };

  it("produces one record per skill, applying the same claim + score", () => {
    const records = computeSkillCalibration({
      ...common,
      skillIds: ["sk-1", "sk-2"],
      claimedConfidence: 0.8,
      demonstrated: 0.5,
    });
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.skillId)).toEqual(["sk-1", "sk-2"]);
    expect(records.map((r) => r.id)).toEqual(["cal-sk-1", "cal-sk-2"]);
    for (const r of records) {
      expect(r.claimedConfidence).toBe(0.8);
      expect(r.demonstrated).toBe(0.5);
      expect(r.delta).toBeCloseTo(0.3, 10);
    }
  });

  it("keeps demonstrated and delta null when ungraded", () => {
    const [rec] = computeSkillCalibration({
      ...common,
      skillIds: ["sk-1"],
      claimedConfidence: 0.9,
      demonstrated: null,
    });
    expect(rec.claimedConfidence).toBe(0.9);
    expect(rec.demonstrated).toBeNull();
    expect(rec.delta).toBeNull();
  });

  it("computes a negative delta when the result ran ahead of the claim", () => {
    const [rec] = computeSkillCalibration({
      ...common,
      skillIds: ["sk-1"],
      claimedConfidence: 0.4,
      demonstrated: 0.9,
    });
    expect(rec.delta).toBeCloseTo(-0.5, 10);
  });

  it("returns no records when there is no claim", () => {
    expect(
      computeSkillCalibration({
        ...common,
        skillIds: ["sk-1", "sk-2"],
        claimedConfidence: null,
        demonstrated: 0.5,
      }),
    ).toEqual([]);
  });

  it("returns no records for an empty skill set", () => {
    expect(
      computeSkillCalibration({
        ...common,
        skillIds: [],
        claimedConfidence: 0.5,
        demonstrated: 0.5,
      }),
    ).toEqual([]);
  });
});
