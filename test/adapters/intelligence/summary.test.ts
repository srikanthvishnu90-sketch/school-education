import { describe, expect, it } from "vitest";

import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import {
  createExtractedSignals,
  type ExtractedSignals,
} from "@/domain/intelligence/signals";
import {
  createFakeGateway,
  type GatewayRequest,
} from "@/adapters/language/gateway";
import { PINNED_MODELS } from "@/adapters/language/models";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";
import { createLlmReflectionIntelligence } from "@/adapters/intelligence/llm";

const NOW = new Date("2026-06-01T00:00:00Z");
const deterministic = createDeterministicReflectionIntelligence({
  now: () => NOW,
});

const session = (texts: string[]): ReflectionSession =>
  createReflectionSession({
    id: "S",
    reflectionId: "R",
    studentId: "STU",
    status: "active",
    startedAt: NOW,
    messages: texts.map((text, i) =>
      createReflectionMessage({
        id: `m${i}`,
        sessionId: "S",
        sender: "student",
        text,
        createdAt: NOW,
      }),
    ),
  });

const signals = (over: Partial<ExtractedSignals>): ExtractedSignals =>
  createExtractedSignals({
    technical: ["understood_concept", "application_difficulty"],
    emotional: ["embarrassed"],
    behavioral: ["avoided_help"],
    context: ["independent_work"],
    ...over,
  });

describe("deterministic student + class summaries", () => {
  it("builds an actionable student summary connecting emotion to behavior", async () => {
    const s = await deterministic.summarizeStudentReflection({
      session: session([
        "I got the examples but froze on my own and was too embarrassed to ask.",
      ]),
      signals: signals({}),
    });
    expect(s.relationshipSummary).toMatch(/embarrassed/i);
    expect(s.recommendedActions.length).toBeGreaterThan(0);
    expect(s.recommendedActions).toContain(
      "Ask for a private, low-pressure check-in.",
    );
    expect(s.evidence.length).toBeGreaterThan(0);
    expect(s.studentFacingSummary).toMatch(/next step/i);
  });

  it("aggregates a class summary with attention groups + a 3-step plan", async () => {
    const c = await deterministic.summarizeClassReflection({
      classId: "C",
      reflectionId: "R",
      students: [
        {
          studentId: "a",
          summary: await deterministic.summarizeStudentReflection({
            session: session(["x"]),
            signals: signals({}),
          }),
          signals: signals({}),
        },
        {
          studentId: "b",
          summary: await deterministic.summarizeStudentReflection({
            session: session(["y"]),
            signals: signals({
              behavioral: [],
              emotional: ["confident"],
              technical: ["understood_concept"],
            }),
          }),
          signals: signals({
            behavioral: [],
            emotional: ["confident"],
            technical: ["understood_concept"],
          }),
        },
      ],
    });
    expect(c.technicalSummary).toMatch(/of 2/);
    expect(c.recommendedPlan).toHaveLength(3);
    // student "a" avoided help → flagged
    expect(c.attentionStudents.some((x) => x.studentId === "a")).toBe(true);
  });

  it("does not invent a relationship from signals reported by different students", async () => {
    const confused = signals({
      technical: ["misunderstood_concept"],
      emotional: [],
      behavioral: [],
    });
    const embarrassed = signals({
      technical: ["understood_concept"],
      emotional: ["embarrassed"],
      behavioral: [],
    });
    const c = await deterministic.summarizeClassReflection({
      classId: "C",
      reflectionId: "R",
      students: [
        {
          studentId: "a",
          summary: await deterministic.summarizeStudentReflection({
            session: session(["I was confused."]),
            signals: confused,
          }),
          signals: confused,
        },
        {
          studentId: "b",
          summary: await deterministic.summarizeStudentReflection({
            session: session(["I felt embarrassed."]),
            signals: embarrassed,
          }),
          signals: embarrassed,
        },
      ],
    });

    expect(c.keyRelationship).toMatch(/no same-student/i);
  });

  it("does not treat uncertainty or a skipped prompt as evidence", async () => {
    const s = await deterministic.summarizeStudentReflection({
      session: session(["I'm not sure", "I'd rather skip this question."]),
      signals: signals({
        technical: [],
        emotional: [],
        behavioral: [],
        context: [],
      }),
    });

    expect(s.evidence).toEqual(["No free-text responses were recorded."]);
    expect(s.confidenceLevel).toBe("limited");
  });
});

describe("LLM student summary (fake gateway)", () => {
  const VALID = JSON.stringify({
    technicalSummary: "Understood examples, unsure independently.",
    emotionalSummary: "Reported feeling embarrassed.",
    behavioralSummary: "Did not ask for help.",
    relationshipSummary: "Embarrassment made asking for help harder.",
    recommendedActions: [
      "Ask for a private check-in.",
      "Use a first-step checklist.",
    ],
    studentFacingSummary:
      "You shared that examples felt clearer. Next step: ask privately.",
    confidenceLevel: "high",
  });

  function intel(responder: (r: GatewayRequest) => string) {
    const gateway = createFakeGateway(responder, {
      models: PINNED_MODELS,
      now: () => NOW,
    });
    return createLlmReflectionIntelligence({
      gateway,
      fallback: deterministic,
      now: () => NOW,
      config: {
        tasks: {
          analyze: true,
          generate: true,
          converse: false,
          signals: false,
          summarize: true,
        },
      },
    });
  }

  it("accepts a valid, non-diagnostic model summary", async () => {
    const s = await intel(() => VALID).summarizeStudentReflection({
      session: session(["I froze on my own."]),
      signals: signals({}),
    });
    expect(s.confidenceLevel).toBe("high");
    expect(s.evidence).toContain("I froze on my own."); // evidence is fact, not model text
  });

  it("falls back when the model summary contains a diagnosis", async () => {
    const diagnostic = JSON.stringify({
      technicalSummary: "Understood examples.",
      emotionalSummary: "The student has anxiety.",
      behavioralSummary: "Did not ask for help.",
      relationshipSummary: "x",
      recommendedActions: ["y"],
      studentFacingSummary: "z next step",
      confidenceLevel: "moderate",
    });
    const s = await intel(() => diagnostic).summarizeStudentReflection({
      session: session(["I froze on my own."]),
      signals: signals({}),
    });
    // deterministic fallback used → no diagnostic phrase present
    expect(s.emotionalSummary).not.toMatch(/anxiety/i);
    expect(s.emotionalSummary).toMatch(/embarrassed/i);
  });

  it("falls back when model actions belong to the teacher instead of the student", async () => {
    const teacherDirected = JSON.stringify({
      ...JSON.parse(VALID),
      recommendedActions: ["Offer a private check-in."],
    });

    const s = await intel(() => teacherDirected).summarizeStudentReflection({
      session: session(["I froze on my own."]),
      signals: signals({}),
    });

    expect(s.recommendedActions).toContain(
      "Ask for a private, low-pressure check-in.",
    );
  });
});
