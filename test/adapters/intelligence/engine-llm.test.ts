import { describe, expect, it } from "vitest";

import { createLesson, type Lesson } from "@/domain/intelligence/lesson";
import type { ReflectionQuestionSet } from "@/domain/intelligence/question";
import {
  createReflectionMessage,
  createReflectionSession,
  type ReflectionSession,
} from "@/domain/intelligence/session";
import {
  createFakeGateway,
  type GatewayRequest,
} from "@/adapters/language/gateway";
import { PINNED_MODELS } from "@/adapters/language/models";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";
import { createLlmReflectionIntelligence } from "@/adapters/intelligence/llm";

/**
 * The LLM engine adds adaptive phrasing (render task) and signal tagging (classify
 * task) — but flow and safety stay deterministic, and bad output falls back. Fake
 * gateway only, no network.
 */

const NOW = new Date("2026-05-01T00:00:00Z");
const deterministic = createDeterministicReflectionIntelligence({
  now: () => NOW,
});

const lesson: Lesson = createLesson({
  id: "L",
  tenantId: "t",
  classId: "C",
  teacherId: "T",
  title: "Slope",
  date: NOW,
  lessonType: "independent_practice",
  content: "Students found slope independently.",
  objectives: [],
  standards: [],
  createdAt: NOW,
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
        converse: true,
        signals: true,
        summarize: true,
      },
    },
  });
}

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

async function questionSet(): Promise<ReflectionQuestionSet> {
  const analysis = await deterministic.analyzeLesson({ lesson });
  return deterministic.generateReflectionQuestions({
    analysis,
    depth: "standard",
    adaptiveFollowups: true,
  });
}

const VALID_SIGNALS = JSON.stringify({
  technical: ["understood_concept"],
  emotional: ["confident"],
  behavioral: ["kept_trying"],
  context: ["independent_work"],
});

describe("LLM adaptive engine (fake gateway)", () => {
  it("uses the model to rephrase the next question", async () => {
    const ai = intel((r) =>
      r.task === "render"
        ? "Thinking about today's slope task, which moment was closest to what happened?"
        : "",
    );
    const step = await ai.nextTurn({
      session: session([]),
      questionSet: await questionSet(),
    });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.text).toBe(
        "Thinking about today's slope task, which moment was closest to what happened?",
      );
      expect(step.stage).toBe("overall"); // stage still decided deterministically
    }
  });

  it("keeps audited question wording by default", async () => {
    const gateway = createFakeGateway(
      (request) => {
        if (request.task === "render") {
          throw new Error("default configuration must not rephrase prompts");
        }
        return "";
      },
      { models: PINNED_MODELS, now: () => NOW },
    );
    const ai = createLlmReflectionIntelligence({
      gateway,
      fallback: deterministic,
      now: () => NOW,
    });
    const set = await questionSet();

    const step = await ai.nextTurn({ session: session([]), questionSet: set });

    expect(step).toMatchObject({
      kind: "question",
      text: set.questions[0]?.text,
    });
    expect(gateway.audit()).toHaveLength(0);
  });

  it("rejects a rephrase that changes a technical prompt into an emotion prompt", async () => {
    const set = await questionSet();
    const ai = intel((request) =>
      request.task === "render" ? "How did finding slope feel today?" : "",
    );

    const step = await ai.nextTurn({ session: session([]), questionSet: set });

    expect(step).toMatchObject({
      kind: "question",
      text: set.questions[0]?.text,
    });
  });

  it("rejects a leading or yes/no rephrase and keeps the deterministic question", async () => {
    const set = await questionSet();
    const ai = intel((r) =>
      r.task === "render"
        ? "When you got stuck finding slope today, did you give up?"
        : "",
    );
    const step = await ai.nextTurn({
      session: session([]),
      questionSet: set,
    });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.text).toBe(set.questions[0]?.text);
    }
  });

  it("does not let rephrasing erase a metacognitive prediction", async () => {
    const set = await questionSet();
    const ai = intel((r) =>
      r.task === "render" ? "How did finding slope feel today?" : "",
    );
    const step = await ai.nextTurn({
      session: session([
        "I started a first step.",
        "Calm",
        "I could explain finding the two points.",
        "I checked an example.",
      ]),
      questionSet: set,
    });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.category).toBe("metacognitive");
      expect(step.text).toBe(set.questions[4]?.text);
      expect(step.text).toMatch(/predict/i);
    }
  });

  it("does not consult the model once the flow says summarize", async () => {
    const set = await questionSet();
    const ai = intel(() => {
      throw new Error("model must not be called at the summary boundary");
    });
    const answers = set.questions.map(
      () => "A full, substantive answer about the method.",
    );
    const step = await ai.nextTurn({
      session: session(answers),
      questionSet: set,
    });
    expect(step.kind).toBe("summary");
  });

  it("accepts valid model-tagged signals", async () => {
    const ai = intel((r) => (r.task === "classify" ? VALID_SIGNALS : ""));
    const signals = await ai.extractSignals({
      session: session(["I felt confident and kept trying."]),
    });
    expect(signals.emotional).toContain("confident");
    expect(signals.context).toContain("independent_work");
  });

  it("falls back to deterministic tagging on an off-schema signal", async () => {
    const ai = intel((r) =>
      r.task === "classify"
        ? JSON.stringify({
            technical: ["made_up_tag"],
            emotional: [],
            behavioral: [],
            context: [],
          })
        : "",
    );
    const signals = await ai.extractSignals({
      session: session(["I felt embarrassed and waited instead of asking."]),
    });
    // deterministic keyword fallback caught the real signals
    expect(signals.emotional).toContain("embarrassed");
    expect(signals.behavioral).toContain("avoided_help");
  });
});
