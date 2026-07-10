import { createLessonAnalysis, type LessonAnalysis } from "@/domain/intelligence/lesson";
import {
  createReflectionQuestionSet,
  type GeneratedQuestion,
  type QuestionCategory,
  type ReflectionQuestionSet,
} from "@/domain/intelligence/question";
import { studentAnswers, type ReflectionStage } from "@/domain/intelligence/session";
import {
  createExtractedSignals,
  type BehavioralSignal,
  type ContextSignal,
  type EmotionalSignal,
  type ExtractedSignals,
  type TechnicalSignal,
} from "@/domain/intelligence/signals";
import type {
  AnalyzeLessonInput,
  ConversationStep,
  ExtractSignalsInput,
  GenerateQuestionsInput,
  NextTurnInput,
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

const VAGUE =
  /^(idk|dunno|i dont know|i don'?t know|not sure|no idea|nothing|maybe|ok|okay|yes|yeah|no|nope)[.!?]*$/i;

function isVague(text: string): boolean {
  const t = text.trim();
  return t.length < 12 || VAGUE.test(t);
}

const STAGE_BY_CATEGORY: Record<QuestionCategory, ReflectionStage> = {
  technical: "technical",
  emotional: "emotional",
  behavioral: "behavioral",
  metacognitive: "support",
};

function stageForQuestion(q: GeneratedQuestion, order: number): ReflectionStage {
  return order === 0 ? "overall" : STAGE_BY_CATEGORY[q.category];
}

// Keyword → signal rules. Any number can fire per conversation; deduped.
const TECHNICAL_RULES: readonly [RegExp, TechnicalSignal][] = [
  [/\b(made sense|understood|got it|i get it|clear)\b/i, "understood_concept"],
  [/\b(confus\w*|didn'?t (get|understand)|lost|no idea what)\b/i, "misunderstood_concept"],
  [/\b(which (method|way|formula)|where to start|how to (begin|start))\b/i, "application_difficulty"],
  [/\b(forgot|couldn'?t remember|blanked|which step)\b/i, "recall_difficulty"],
  [/\b(ran out of time|no time|rushed the|didn'?t finish)\b/i, "time_management"],
  [/\b(silly|careless|small) (mistake|error)\b/i, "careless_error"],
];
const EMOTIONAL_RULES: readonly [RegExp, EmotionalSignal][] = [
  [/\bconfiden\w*\b/i, "confident"],
  [/\bfrustrat\w*\b/i, "frustrated"],
  [/\bembarrass\w*\b/i, "embarrassed"],
  [/\brush\w*\b/i, "rushed"],
  [/\boverwhelm\w*\b/i, "overwhelmed"],
  [/\bbored?\b/i, "bored"],
  [/\bcurious\b/i, "curious"],
  [/\bdiscourag\w*\b/i, "discouraged"],
  [/\b(proud|getting better|improv\w*)\b/i, "sense_of_progress"],
  [/\b(nervous|anxious|scared|afraid)\b/i, "fear_of_mistakes"],
];
const BEHAVIORAL_RULES: readonly [RegExp, BehavioralSignal][] = [
  [/\b(asked (for help|the teacher|a question)|raised my hand)\b/i, "asked_for_help"],
  [/\b(didn'?t ask|too (embarrassed|scared) to ask|waited|stayed quiet)\b/i, "avoided_help"],
  [/\b(kept (trying|going)|tried again|didn'?t give up)\b/i, "kept_trying"],
  [/\b(gave up|stopped|quit|shut down)\b/i, "stopped_working"],
  [/\bguess\w*\b/i, "guessed"],
  [/\b((used my )?notes|the example\w*)\b/i, "used_notes"],
  [/\b(checked|double.?check\w*|went back over)\b/i, "checked_work"],
];
const CONTEXT_RULES: readonly [RegExp, ContextSignal][] = [
  [/\b(independent\w*|on my own|by myself|alone)\b/i, "independent_work"],
  [/\b(group|partner|together|classmate helped)\b/i, "group_work"],
  [/\b(test|quiz|exam|assessment)\b/i, "assessment"],
  [/\b(ran out of time|time pressure|clock|too fast)\b/i, "time_pressure"],
  [/\b(everyone else|others finished|classmates|other people)\b/i, "peer_comparison"],
];

function matchAll<S extends string>(
  text: string,
  rules: readonly [RegExp, S][],
): S[] {
  const out: S[] = [];
  for (const [re, sig] of rules) {
    if (re.test(text) && !out.includes(sig)) out.push(sig);
  }
  return out;
}

export function createDeterministicReflectionIntelligence(deps: {
  now: () => Date;
  /** Deterministic safety detector; the app wires the crisis detector here. */
  safetyCheck?: (text: string) => boolean;
}): ReflectionIntelligence {
  const { now } = deps;
  const safetyCheck = deps.safetyCheck ?? (() => false);

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

  function next(input: NextTurnInput): ConversationStep {
    const { session, questionSet } = input;
    const answers = studentAnswers(session);
    const latest = answers.at(-1);
    // Safety is checked FIRST, every turn, and by deterministic detection only.
    if (latest && safetyCheck(latest.text)) return { kind: "safety" };

    const primaries = questionSet.questions;
    const answered = answers.length;
    if (answered < primaries.length) {
      const q = primaries[answered];
      return {
        kind: "question",
        stage: stageForQuestion(q, answered),
        category: q.category,
        text: q.text,
        format: q.format,
        options: q.options,
      };
    }
    // All primaries answered: one clarifying follow-up if the last reply was
    // vague and follow-ups remain; otherwise there is enough to summarize.
    const followupsUsed = answered - primaries.length;
    if (
      followupsUsed < questionSet.maxFollowups &&
      latest !== undefined &&
      isVague(latest.text)
    ) {
      return {
        kind: "question",
        stage: "support",
        category: "metacognitive",
        text: "Can you say a bit more about what specifically made that hard?",
        format: "short_response",
      };
    }
    return { kind: "summary" };
  }

  function extract(input: ExtractSignalsInput): ExtractedSignals {
    const text = studentAnswers(input.session)
      .map((m) => m.text)
      .join("\n");
    return createExtractedSignals({
      technical: matchAll(text, TECHNICAL_RULES),
      emotional: matchAll(text, EMOTIONAL_RULES),
      behavioral: matchAll(text, BEHAVIORAL_RULES),
      context: matchAll(text, CONTEXT_RULES),
    });
  }

  return {
    analyzeLesson: async (input) => analyze(input),
    generateReflectionQuestions: async (input) => generate(input),
    nextTurn: async (input) => next(input),
    extractSignals: async (input) => extract(input),
  };
}
