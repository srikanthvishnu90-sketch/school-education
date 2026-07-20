import { describe, expect, it } from "vitest";

import { DomainError } from "@/domain/common";
import {
  approveQuestionSet,
  createGeneratedQuestion,
  createReflectionQuestionSet,
  isBalancedQuestionSet,
  isQuestionSetApproved,
  type GeneratedQuestion,
  type ReflectionQuestionSet,
} from "@/domain/intelligence/question";

/**
 * The balance invariant is a product guarantee ("connect emotion to learning"),
 * so the type must be unconstructable without both a technical and an emotional
 * question and a 4–6 length. Closed formats must carry options.
 */

const q = (over: Partial<GeneratedQuestion>): GeneratedQuestion => ({
  id: "q",
  category: "technical",
  text: "text",
  format: "short_response",
  order: 0,
  required: false,
  aiGenerated: true,
  ...over,
});

const base = (questions: GeneratedQuestion[]): ReflectionQuestionSet => ({
  lessonId: "lesson-1",
  questions,
  adaptiveFollowupsEnabled: true,
  maxFollowups: 4,
  createdAt: new Date("2026-01-01"),
  approvedAt: null,
});

const fourBalanced = (): GeneratedQuestion[] => [
  q({ id: "a", category: "technical", order: 0 }),
  q({ id: "b", category: "emotional", order: 1 }),
  q({ id: "c", category: "behavioral", order: 2 }),
  q({ id: "d", category: "metacognitive", order: 3 }),
];

describe("reflection question set", () => {
  it("accepts a balanced 4–6 set with technical + emotional", () => {
    const set = createReflectionQuestionSet(base(fourBalanced()));
    expect(isBalancedQuestionSet(set)).toBe(true);
    expect(set.questions).toHaveLength(4);
  });

  it("rejects a set with no emotional question", () => {
    const all = fourBalanced().map((x) => ({ ...x, category: "technical" as const }));
    expect(() => createReflectionQuestionSet(base(all))).toThrow(DomainError);
  });

  it("rejects a set with fewer than 4 or more than 6 questions", () => {
    expect(() => createReflectionQuestionSet(base(fourBalanced().slice(0, 3)))).toThrow(
      DomainError,
    );
    const seven = [
      ...fourBalanced(),
      q({ id: "e", order: 4 }),
      q({ id: "f", category: "emotional", order: 5 }),
      q({ id: "g", order: 6 }),
    ];
    expect(() => createReflectionQuestionSet(base(seven))).toThrow(DomainError);
  });

  it("rejects a closed-format question with no options", () => {
    expect(() =>
      createGeneratedQuestion(q({ format: "multiple_choice" })),
    ).toThrow(DomainError);
    // ...and accepts it once options are supplied.
    expect(
      createGeneratedQuestion(
        q({ format: "multiple_choice", options: ["yes", "no"] }),
      ).options,
    ).toEqual(["yes", "no"]);
  });
});

describe("teacher approval gate", () => {
  it("a freshly drafted set is not approved", () => {
    const set = createReflectionQuestionSet(base(fourBalanced()));
    expect(set.approvedAt).toBeNull();
    expect(isQuestionSetApproved(set)).toBe(false);
  });

  it("approveQuestionSet stamps the moment a teacher approved", () => {
    const at = new Date("2026-07-11T09:00:00.000Z");
    const approved = approveQuestionSet(
      createReflectionQuestionSet(base(fourBalanced())),
      at,
    );
    expect(approved.approvedAt).toEqual(at);
    expect(isQuestionSetApproved(approved)).toBe(true);
  });

  it("re-approving keeps the first approval time (idempotent)", () => {
    const first = new Date("2026-07-11T09:00:00.000Z");
    const later = new Date("2026-07-12T09:00:00.000Z");
    const once = approveQuestionSet(
      createReflectionQuestionSet(base(fourBalanced())),
      first,
    );
    const twice = approveQuestionSet(once, later);
    expect(twice.approvedAt).toEqual(first);
  });
});
