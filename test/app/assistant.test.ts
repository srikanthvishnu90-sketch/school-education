import { describe, expect, it } from "vitest";

import { assistantOpening, assistantReply } from "@/app/_world/assistant";
import { isNonDiagnostic } from "@/domain/intelligence/nonDiagnostic";

const ctx = {
  courseName: "Algebra II",
  teacher: "Ms. Rivera",
  studentName: "Avery",
};

describe("study assistant", () => {
  it("opens with a warm-up that names the student and the class", () => {
    const opening = assistantOpening(ctx);
    expect(opening).toContain("Avery");
    expect(opening).toContain("Algebra II");
    expect(opening).toContain("?"); // invites a response
  });

  it("falls back to a safe, non-diagnostic reflective reply with no model key", async () => {
    // No ANTHROPIC_API_KEY in the test env → the deterministic fallback path.
    const reply = await assistantReply(ctx, [
      { role: "assistant", text: assistantOpening(ctx) },
      { role: "student", text: "factoring was really confusing today" },
    ]);
    expect(reply.length).toBeGreaterThan(0);
    // Zero-LLM must still be task-focused, never a verdict about the student.
    expect(isNonDiagnostic(reply)).toBe(true);
    expect(reply).toMatch(/\?$/);
  });

  it("never throws to the caller", async () => {
    await expect(assistantReply(ctx, [])).resolves.toBeTypeOf("string");
  });
});
