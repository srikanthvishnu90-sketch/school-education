import { describe, expect, it } from "vitest";

import {
  createItemLevelMockProvider,
  quizWorldFieldMap,
  QUIZWORLD_PROVIDER_ID,
  type QuizWorldRow,
} from "@/adapters/provider";
import { defineProviderContract } from "../../support/providerContract";

/**
 * Provider A: QuizWorld — an item-level, skill-tagged source. It runs the shared
 * EvidenceProvider contract and then pins its own native → canonical translation.
 */

const GOOD_ROWS: QuizWorldRow[] = [
  {
    learner: "stu-1",
    quizId: "q-1",
    quizName: "Unit 1 check",
    ts: "2026-01-05T09:00:00.000Z",
    attempt: 1,
    questions: [
      { qid: "q1-a", standard: "skill-linear", text: "Solve 3x+5=20", score: 1, outOf: 1 },
      { qid: "q1-b", standard: "skill-linear", text: "Solve 2(x-4)=10", score: 0, outOf: 1 },
    ],
  },
  {
    learner: "stu-1",
    quizId: "q-2",
    ts: "2026-01-08T09:00:00.000Z",
    questions: [
      { qid: "q2-a", standard: "skill-slope", score: 2, outOf: 2 },
    ],
  },
  {
    learner: "stu-2",
    quizId: "q-1",
    ts: "2026-01-05T09:00:00.000Z",
    questions: [{ qid: "q1-a", standard: "skill-linear", score: 1, outOf: 1 }],
  },
];

/** A stu-1 row with a question missing its qid — item detail is unusable. */
const MALFORMED_ROW: QuizWorldRow = {
  learner: "stu-1",
  quizId: "q-bad",
  ts: "2026-01-09T09:00:00.000Z",
  questions: [{ qid: "", standard: "skill-linear", score: 1, outOf: 1 }],
};

defineProviderContract({
  name: "QuizWorld",
  capabilities: { itemLevel: true, skillTags: true, attendance: false },
  studentId: "stu-1",
  emptyStudentId: "stu-none",
  validCount: 2,
  makeConfirmed: () =>
    createItemLevelMockProvider({ rows: GOOD_ROWS, fieldMap: quizWorldFieldMap() }),
  makeProposed: () =>
    createItemLevelMockProvider({
      rows: GOOD_ROWS,
      fieldMap: quizWorldFieldMap("proposed"),
    }),
  makeWithMalformedRow: () =>
    createItemLevelMockProvider({
      rows: [...GOOD_ROWS, MALFORMED_ROW],
      fieldMap: quizWorldFieldMap(),
    }),
});

describe("QuizWorld — native → canonical translation", () => {
  it("maps identity fields via the field map and questions into canonical items", async () => {
    const provider = createItemLevelMockProvider({
      rows: GOOD_ROWS,
      fieldMap: quizWorldFieldMap(),
    });
    const [first] = await provider.pull("stu-1");

    expect(first.studentId).toBe("stu-1");
    expect(first.assessmentRef).toBe("q-1");
    expect(first.assessmentTitle).toBe("Unit 1 check");
    expect(first.revision).toBe(1);
    expect(first.items).toEqual([
      {
        itemRef: "q1-a",
        skillTag: "skill-linear",
        prompt: "Solve 3x+5=20",
        correct: true,
        pointsAwarded: 1,
        maxPoints: 1,
      },
      {
        itemRef: "q1-b",
        skillTag: "skill-linear",
        prompt: "Solve 2(x-4)=10",
        correct: false,
        pointsAwarded: 0,
        maxPoints: 1,
      },
    ]);
  });

  it("carries a stable provider id", () => {
    const provider = createItemLevelMockProvider({
      rows: [],
      fieldMap: quizWorldFieldMap(),
    });
    expect(provider.id).toBe(QUIZWORLD_PROVIDER_ID);
  });

  it("honors `since` (strictly-after)", async () => {
    const provider = createItemLevelMockProvider({
      rows: GOOD_ROWS,
      fieldMap: quizWorldFieldMap(),
    });
    const pulled = await provider.pull(
      "stu-1",
      new Date("2026-01-05T09:00:00.000Z"),
    );
    expect(pulled).toHaveLength(1);
    expect(pulled[0].assessmentRef).toBe("q-2");
  });
});
