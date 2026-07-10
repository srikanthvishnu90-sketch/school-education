import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/common";
import {
  createClassInsightSummary,
  createStudentInsightSummary,
  type ClassInsightSummary,
  type StudentInsightSummary,
} from "@/domain/intelligence/insight";

const student = (over: Partial<StudentInsightSummary>): StudentInsightSummary => ({
  id: "s",
  studentId: "stu",
  reflectionId: "r",
  technicalSummary: "Understood the examples.",
  emotionalSummary: "Reported feeling rushed.",
  behavioralSummary: "Did not ask for help.",
  relationshipSummary: "Feeling rushed made it harder to check the work.",
  recommendedActions: ["Offer a private check-in."],
  studentFacingSummary: "You did well on the examples. Next step: try one on your own.",
  evidence: ["It made sense until I worked alone."],
  confidenceLevel: "moderate",
  createdAt: new Date("2026-01-01"),
  ...over,
});

const klass = (over: Partial<ClassInsightSummary>): ClassInsightSummary => ({
  id: "c",
  classId: "class",
  reflectionId: "r",
  technicalSummary: "6 of 10 understood the concept.",
  emotionalSummary: "4 reported low confidence.",
  behavioralSummary: "3 did not ask for help.",
  keyRelationship: "Confidence dropped during independent work.",
  recommendedPlan: ["Start with a warm-up.", "Review method selection."],
  attentionStudents: [{ studentId: "stu", group: "high_understanding_low_confidence" }],
  createdAt: new Date("2026-01-01"),
  ...over,
});

describe("student insight summary", () => {
  it("accepts an actionable, non-diagnostic summary", () => {
    expect(createStudentInsightSummary(student({})).confidenceLevel).toBe("moderate");
  });

  it("rejects a summary with no evidence or no recommended action", () => {
    expect(() => createStudentInsightSummary(student({ evidence: [] }))).toThrow(DomainError);
    expect(() =>
      createStudentInsightSummary(student({ recommendedActions: [] })),
    ).toThrow(DomainError);
  });

  it("rejects diagnostic language anywhere in the summary", () => {
    expect(() =>
      createStudentInsightSummary(student({ emotionalSummary: "The student has anxiety." })),
    ).toThrow(DomainError);
    expect(() =>
      createStudentInsightSummary(
        student({ recommendedActions: ["Refer because the student is depressed."] }),
      ),
    ).toThrow(DomainError);
  });
});

describe("class insight summary", () => {
  it("accepts a 1–5 step, non-diagnostic plan", () => {
    expect(createClassInsightSummary(klass({})).recommendedPlan).toHaveLength(2);
  });

  it("rejects an empty or over-long plan", () => {
    expect(() => createClassInsightSummary(klass({ recommendedPlan: [] }))).toThrow(DomainError);
    expect(() =>
      createClassInsightSummary(klass({ recommendedPlan: ["1", "2", "3", "4", "5", "6"] })),
    ).toThrow(DomainError);
  });
});
