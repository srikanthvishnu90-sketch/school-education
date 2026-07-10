import { createLessonAnalysis, type LessonAnalysis } from "@/domain/intelligence/lesson";
import {
  createReflectionQuestionSet,
  type GeneratedQuestion,
  type ReflectionQuestionSet,
} from "@/domain/intelligence/question";
import type {
  AnalyzeLessonInput,
  GenerateQuestionsInput,
  ReflectionIntelligence,
} from "@/domain/ports/intelligence";

/**
 * DeterministicReflectionIntelligence — rule-based, zero-LLM. Same lesson → same
 * analysis and same questions, always. This is the default the product runs on;
 * the LLM adapter (next slice) implements the identical port and only IMPROVES
 * the drafting. Nothing here decides an intervention or a student's state.
 */

// Leading boundary only, so it also catches "independently" / "individually".
const INDEPENDENT_MARKERS =
  /\b(independent|individual|on their own|by themselves|solo|alone)/i;

const DEPTH_COUNT: Record<GenerateQuestionsInput["depth"], number> = {
  shorter: 4,
  standard: 5,
  deeper: 6,
};

function extractVocabulary(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of content.split(/[^A-Za-z-]+/)) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (word.length >= 7 && !seen.has(key)) {
      seen.add(key);
      out.push(word);
      if (out.length >= 6) break;
    }
  }
  return out;
}

export function createDeterministicReflectionIntelligence(deps: {
  now: () => Date;
}): ReflectionIntelligence {
  const { now } = deps;

  function analyze(input: AnalyzeLessonInput): LessonAnalysis {
    const { lesson } = input;
    const topic = lesson.title.trim() || lesson.content.trim().slice(0, 60);
    const independent =
      INDEPENDENT_MARKERS.test(lesson.content) ||
      lesson.lessonType === "independent_practice";
    const assessmentish =
      lesson.lessonType === "assessment_prep" || lesson.lessonType === "review";
    const collaborative =
      lesson.lessonType === "group_work" || lesson.lessonType === "discussion";

    const pressure: string[] = [];
    if (independent) {
      pressure.push(
        "Students may feel confident during teacher examples but uncertain when working independently.",
      );
    }
    if (assessmentish) {
      pressure.push(
        "Students may feel time pressure or worry about being tested on this.",
      );
    }
    if (collaborative) {
      pressure.push(
        "Students may hesitate to participate or compare themselves with classmates.",
      );
    }
    if (pressure.length === 0) {
      pressure.push(
        "Students may hesitate to ask for help when something is confusing.",
      );
    }

    const independentApplication = independent
      ? [`Applying ${topic} without a worked example in front of them.`]
      : [];

    const reflectionFocus = independent
      ? "Independent application, response to mistakes, and willingness to ask for help."
      : "Understanding, confidence, and what the student did when stuck.";

    return createLessonAnalysis({
      lessonId: lesson.id,
      topic,
      subtopics: [],
      objectives: [...lesson.objectives],
      vocabulary: extractVocabulary(lesson.content),
      prerequisites: [],
      technicalSteps: [],
      misconceptions: [],
      difficultTransitions: [],
      independentApplication,
      emotionalPressurePoints: pressure,
      reflectionFocus,
      createdAt: now(),
    });
  }

  function generate(input: GenerateQuestionsInput): ReflectionQuestionSet {
    const { analysis, depth, adaptiveFollowups } = input;
    const topic = analysis.topic;
    // Ordered pool. Index 0 is technical, index 1 emotional, so any 4–6 prefix
    // keeps the balance invariant (technical + emotional both present).
    const pool: Omit<GeneratedQuestion, "id" | "order">[] = [
      {
        category: "technical",
        text: `How clear did today's work on ${topic} feel overall?`,
        format: "rating",
        required: true,
        aiGenerated: true,
      },
      {
        category: "emotional",
        text: `Which word best fits how you felt working on ${topic} today?`,
        format: "emotion_select",
        options: [
          "confident",
          "frustrated",
          "confused",
          "rushed",
          "calm",
          "curious",
          "discouraged",
          "proud",
        ],
        required: true,
        aiGenerated: true,
      },
      {
        category: "technical",
        text: `Where did ${topic} stop making sense — walk me through the moment it got hard.`,
        format: "long_response",
        required: false,
        aiGenerated: true,
      },
      {
        category: "behavioral",
        text: "When you got stuck, what did you do?",
        format: "multiple_choice",
        options: [
          "Kept trying on my own",
          "Asked for help",
          "Used my notes or examples",
          "Guessed",
          "Waited or stopped",
        ],
        required: false,
        aiGenerated: true,
      },
      {
        category: "metacognitive",
        text: "What is one thing you would do differently next time?",
        format: "short_response",
        required: false,
        aiGenerated: true,
      },
      {
        category: "emotional",
        text: `How confident do you feel doing ${topic} on your own now?`,
        format: "confidence_slider",
        required: false,
        aiGenerated: true,
      },
    ];

    const questions: GeneratedQuestion[] = pool
      .slice(0, DEPTH_COUNT[depth])
      .map((q, order) => ({ ...q, id: `${analysis.lessonId}-q${order}`, order }));

    return createReflectionQuestionSet({
      lessonId: analysis.lessonId,
      questions,
      adaptiveFollowupsEnabled: adaptiveFollowups,
      maxFollowups: adaptiveFollowups ? 4 : 0,
      createdAt: now(),
    });
  }

  return {
    analyzeLesson: async (input) => analyze(input),
    generateReflectionQuestions: async (input) => generate(input),
  };
}
