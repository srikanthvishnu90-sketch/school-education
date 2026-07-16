import { afterEach, describe, expect, it } from "vitest";

import {
  deleteStudyChatsByStudent,
  loadStudyChat,
  saveStudyChat,
  __setStudyChatStoreForTest,
} from "@/app/_world/studyChat";
import type { AssistantMessage } from "@/app/_world/assistant";

afterEach(() => __setStudyChatStoreForTest(null));

const convo: AssistantMessage[] = [
  { role: "student", text: "factoring was confusing" },
  { role: "assistant", text: "What step felt unsure?" },
];

describe("study chat persistence", () => {
  it("round-trips a conversation per (student, course)", async () => {
    await saveStudyChat("student-avery", "class-1", convo);
    expect(await loadStudyChat("student-avery", "class-1")).toEqual(convo);
    // Isolated by course and by student.
    expect(await loadStudyChat("student-avery", "class-chem")).toEqual([]);
    expect(await loadStudyChat("student-blake", "class-1")).toEqual([]);
  });

  it("erasure deletes every chat for a student across courses, and only theirs", async () => {
    await saveStudyChat("student-avery", "class-1", convo);
    await saveStudyChat("student-avery", "class-chem", convo);
    await saveStudyChat("student-blake", "class-1", convo);

    const removed = await deleteStudyChatsByStudent("student-avery");
    expect(removed).toBe(2);
    expect(await loadStudyChat("student-avery", "class-1")).toEqual([]);
    expect(await loadStudyChat("student-avery", "class-chem")).toEqual([]);
    // Another student's chat is untouched.
    expect(await loadStudyChat("student-blake", "class-1")).toEqual(convo);
  });
});
