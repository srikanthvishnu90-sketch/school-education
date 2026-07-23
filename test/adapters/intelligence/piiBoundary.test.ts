import { describe, expect, it } from "vitest";

import { createLesson } from "@/domain/intelligence/lesson";
import { piiRoster } from "@/app/_world/intelligence";
import { stripPii } from "@/adapters/language/pii";
import {
  PINNED_MODELS,
  createFakeGateway,
  type GatewayRequest,
} from "@/adapters/language";
import {
  createDeterministicReflectionIntelligence,
  createLlmReflectionIntelligence,
} from "@/adapters/intelligence";

/**
 * Boundary proof for brief item B6 (verification half): a student/staff name, an
 * email, and any id-shaped identifier are stripped BEFORE any text crosses into
 * the model. `stripPii` unit-redacts, and — the load-bearing half — the LLM
 * intelligence adapter actually runs it before `gateway.send`, so what the model
 * boundary receives (the exact `prompt` the transport serializes) carries no
 * learner identifier. Ordinary math words must survive (no over-redaction).
 */

const NOW = new Date("2026-03-01T00:00:00Z");

// A payload that mixes identifiers with ordinary academic content.
const STUDENT_NAME = "Avery"; // seeded student first name (on the roster)
const STAFF_NAME = "Ms. Rivera"; // seeded staff name (full + surname on the roster)
const EMAIL = "avery.chen@northside.k12.us";
const STUDENT_ID = "student-avery-7f3"; // adapter/id-shaped token
const ROSTER_NO = "883472"; // long digit run (student number)

describe("stripPii removes identifiers, keeps ordinary content", () => {
  it("redacts a student name, a staff name, an email, an id, and a long number", () => {
    const { clean, count } = stripPii(
      `${STUDENT_NAME} emailed ${EMAIL} (student id ${STUDENT_ID}, roster no. ${ROSTER_NO}). ` +
        `${STAFF_NAME} says to keep factoring quadratic equations.`,
      // Built the way the app does: the known roster (seed students + staff names).
      piiRoster(),
    );

    // Every identifier is gone from the output...
    expect(clean).not.toContain(STUDENT_NAME);
    expect(clean.toLowerCase()).not.toContain("avery");
    expect(clean).not.toContain("Rivera");
    expect(clean).not.toContain(EMAIL);
    expect(clean).not.toContain(STUDENT_ID);
    expect(clean).not.toContain(ROSTER_NO);
    // ...replaced by the fixed placeholder the impl uses.
    expect(clean).toContain("[redacted]");
    expect(count).toBeGreaterThanOrEqual(5);

    // Ordinary academic words are preserved — no over-redaction.
    expect(clean).toContain("factoring");
    expect(clean).toContain("quadratic");
    expect(clean).toContain("equations");
  });
});

describe("the model boundary never receives a learner identifier", () => {
  it("the LLM adapter strips PII before the gateway is called", async () => {
    // Capture the EXACT request that reaches the model boundary. `request.prompt`
    // is what the real transport serializes onto the wire (see userContent), so
    // asserting on it proves what would actually leave the process.
    let seen: GatewayRequest | undefined;
    const gateway = createFakeGateway(
      (request) => {
        seen = request;
        return "{}"; // any reply; the adapter validates/falls back after the send
      },
      { models: PINNED_MODELS, now: () => NOW },
    );

    const intel = createLlmReflectionIntelligence({
      gateway,
      fallback: createDeterministicReflectionIntelligence({ now: () => NOW }),
      now: () => NOW,
      // Same redaction set the world wires in (piiRoster union), resolved per call.
      config: { pii: () => piiRoster() },
    });

    const lesson = createLesson({
      id: "lesson-b6",
      tenantId: "district-demo",
      classId: "class-1",
      teacherId: "teacher-1",
      title: "Factoring quadratic equations",
      date: NOW,
      lessonType: "independent_practice",
      // Identifiers embedded in the untrusted lesson text.
      content:
        `${STUDENT_NAME} emailed ${EMAIL} about the quiz. ${STAFF_NAME} noted that ` +
        `${STUDENT_NAME} (student id ${STUDENT_ID}, roster no. ${ROSTER_NO}) should ` +
        `keep factoring these quadratic equations independently.`,
      objectives: [],
      standards: [],
      createdAt: NOW,
    });

    await intel.analyzeLesson({ lesson });

    // The gateway was actually reached (this is a real boundary crossing)...
    expect(seen).toBeDefined();
    const prompt = seen?.prompt ?? "";

    // ...and nothing that could re-identify a learner survived to it.
    expect(prompt.toLowerCase()).not.toContain("avery");
    expect(prompt).not.toContain("Rivera");
    expect(prompt).not.toContain(EMAIL);
    expect(prompt).not.toContain(STUDENT_ID);
    expect(prompt).not.toContain(ROSTER_NO);
    expect(prompt).toContain("[redacted]");

    // The academic substance the model needs is still there.
    expect(prompt).toContain("factoring");
    expect(prompt).toContain("quadratic");
  });
});
