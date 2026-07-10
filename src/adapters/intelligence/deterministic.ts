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
import {
  createClassInsightSummary,
  createStudentInsightSummary,
  type AttentionStudent,
  type ClassInsightSummary,
  type ConfidenceLevel,
  type StudentInsightSummary,
} from "@/domain/intelligence/insight";
import type {
  AnalyzeLessonInput,
  ConversationStep,
  ExtractSignalsInput,
  GenerateQuestionsInput,
  NextTurnInput,
  ReflectionIntelligence,
  SummarizeClassInput,
  SummarizeStudentInput,
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

// --- Summary phrasing from signals (observed language, never diagnostic) -----

function technicalPhrase(s: ExtractedSignals): string {
  const t = s.technical;
  if (t.includes("understood_concept") && (t.includes("application_difficulty") || t.includes("misunderstood_concept")))
    return "Followed the guided examples but was unsure how to apply the concept independently.";
  if (t.includes("misunderstood_concept")) return "Reported confusion about the core concept.";
  if (t.includes("recall_difficulty")) return "Had trouble recalling a needed step.";
  if (t.includes("understood_concept")) return "Reported understanding the concept.";
  return "Understanding is unclear from this reflection.";
}

function emotionalPhrase(s: ExtractedSignals): string {
  const e = s.emotional;
  if (e.includes("embarrassed")) return "Reported feeling embarrassed at a difficult moment.";
  if (e.includes("discouraged")) return "Reported feeling discouraged after a mistake.";
  if (e.includes("overwhelmed")) return "Reported feeling overwhelmed.";
  if (e.includes("rushed")) return "Reported feeling rushed.";
  if (e.includes("frustrated")) return "Reported frustration during the work.";
  if (e.includes("sense_of_progress")) return "Reported a sense of progress.";
  if (e.includes("confident")) return "Reported feeling confident.";
  return "Emotional experience was mixed or unstated.";
}

function behavioralPhrase(s: ExtractedSignals): string {
  const b = s.behavioral;
  if (b.includes("avoided_help")) return "Did not ask for help when stuck.";
  if (b.includes("asked_for_help")) return "Asked for help when stuck.";
  if (b.includes("stopped_working")) return "Stopped working after getting stuck.";
  if (b.includes("kept_trying")) return "Kept trying after getting stuck.";
  if (b.includes("guessed")) return "Guessed when unsure.";
  if (b.includes("used_notes")) return "Leaned on notes or examples.";
  return "Learning behavior was not clear from this reflection.";
}

function relationshipPhrase(s: ExtractedSignals): string {
  const { emotional: e, behavioral: b, technical: t } = s;
  if (e.includes("embarrassed") && b.includes("avoided_help"))
    return "Feeling embarrassed appears to have made it harder to ask for help, which may have let the confusion continue.";
  if (e.includes("rushed") && t.includes("careless_error"))
    return "Feeling rushed appears to have led to avoidable errors.";
  if (b.includes("avoided_help") && t.includes("misunderstood_concept"))
    return "Not asking for help appears to have let the misunderstanding continue.";
  if (e.includes("confident") && t.includes("understood_concept"))
    return "Confidence tracked with genuine understanding here.";
  return "No strong link between emotion, behavior, and understanding stood out.";
}

function actionsFor(s: ExtractedSignals): string[] {
  const out: string[] = [];
  if (s.behavioral.includes("avoided_help") || s.emotional.includes("embarrassed"))
    out.push("Offer a private, low-pressure check-in.");
  if (s.technical.includes("application_difficulty") || s.technical.includes("misunderstood_concept"))
    out.push("Give a first-step checklist for choosing a method.");
  if (s.emotional.includes("rushed") || s.context.includes("time_pressure"))
    out.push("Add a calm, untimed warm-up before independent work.");
  if (out.length === 0)
    out.push("Confirm understanding with one quick independent example next class.");
  return out;
}

function studentFacing(s: ExtractedSignals, action: string): string {
  const tech = s.technical.includes("application_difficulty")
    ? "You understood the examples but weren't sure how to start on your own. "
    : "You reflected on today's work. ";
  const feel = s.emotional.includes("embarrassed")
    ? "Feeling embarrassed made it harder to ask for help. "
    : "";
  return `${tech}${feel}Your next step: ${action.toLowerCase().replace(/\.$/, "")}.`;
}

function confidenceFor(s: ExtractedSignals, words: number): ConfidenceLevel {
  const total = s.technical.length + s.emotional.length + s.behavioral.length;
  if (total >= 4 && words >= 25) return "high";
  if (total >= 2) return "moderate";
  return "limited";
}

const LOW_CONFIDENCE_EMOTIONS: readonly EmotionalSignal[] = [
  "embarrassed",
  "discouraged",
  "overwhelmed",
  "fear_of_mistakes",
];

function attentionGroupFor(s: ExtractedSignals): AttentionStudent["group"] | null {
  const understood = s.technical.includes("understood_concept");
  const confused =
    s.technical.includes("misunderstood_concept") ||
    s.technical.includes("application_difficulty");
  const lowConf = s.emotional.some((e) => LOW_CONFIDENCE_EMOTIONS.includes(e));
  if (s.behavioral.includes("avoided_help")) return "repeated_help_avoidance";
  if (s.emotional.includes("sense_of_progress") && s.behavioral.includes("kept_trying"))
    return "positive_improvement";
  if (confused && lowConf) return "low_understanding_low_confidence";
  if (understood && lowConf) return "high_understanding_low_confidence";
  if (confused && s.emotional.includes("confident")) return "low_understanding_high_confidence";
  return null;
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

  function summarizeStudent(input: SummarizeStudentInput): StudentInsightSummary {
    const { session, signals } = input;
    const answers = studentAnswers(session).map((m) => m.text.trim()).filter(Boolean);
    const words = answers.join(" ").split(/\s+/).filter(Boolean).length;
    const actions = actionsFor(signals);
    return createStudentInsightSummary({
      id: `${session.id}-summary`,
      studentId: session.studentId,
      reflectionId: session.reflectionId,
      technicalSummary: technicalPhrase(signals),
      emotionalSummary: emotionalPhrase(signals),
      behavioralSummary: behavioralPhrase(signals),
      relationshipSummary: relationshipPhrase(signals),
      recommendedActions: actions,
      studentFacingSummary: studentFacing(signals, actions[0]),
      evidence: answers.length > 0 ? answers : ["No free-text responses were recorded."],
      confidenceLevel: confidenceFor(signals, words),
      createdAt: now(),
    });
  }

  function summarizeClass(input: SummarizeClassInput): ClassInsightSummary {
    const n = input.students.length;
    const count = (pred: (s: ExtractedSignals) => boolean): number =>
      input.students.filter((x) => pred(x.signals)).length;
    const understood = count((s) => s.technical.includes("understood_concept"));
    const confused = count(
      (s) =>
        s.technical.includes("misunderstood_concept") ||
        s.technical.includes("application_difficulty"),
    );
    const lowConfidence = count(
      (s) => s.emotional.includes("embarrassed") || s.behavioral.includes("avoided_help"),
    );
    const rushed = count(
      (s) => s.emotional.includes("rushed") || s.context.includes("time_pressure"),
    );

    const attentionStudents: AttentionStudent[] = input.students
      .map((x): AttentionStudent | null => {
        const group = attentionGroupFor(x.signals);
        return group ? { studentId: x.studentId, group } : null;
      })
      .filter((x): x is AttentionStudent => x !== null);

    const keyRelationship =
      lowConfidence > 0 && confused > 0
        ? "Several students understood the guided examples but lost confidence working independently; those who felt embarrassed were less likely to ask for help."
        : "No single technical–emotional pattern dominated the class.";

    return createClassInsightSummary({
      id: `${input.reflectionId}-class`,
      classId: input.classId,
      reflectionId: input.reflectionId,
      technicalSummary: `${understood} of ${n} reported understanding the concept; ${confused} reported confusion or trouble applying it independently.`,
      emotionalSummary: `${lowConfidence} of ${n} showed low confidence or hesitation to ask for help; ${rushed} reported feeling rushed.`,
      behavioralSummary: `${count((s) => s.behavioral.includes("avoided_help"))} did not ask for help when stuck; ${count((s) => s.behavioral.includes("kept_trying"))} kept trying.`,
      keyRelationship,
      recommendedPlan: [
        "Start with one low-pressure independent example.",
        "Review how to choose the right method before practice.",
        "Normalize mistakes and offer a way to ask questions privately.",
      ],
      attentionStudents,
      createdAt: now(),
    });
  }

  return {
    analyzeLesson: async (input) => analyze(input),
    generateReflectionQuestions: async (input) => generate(input),
    nextTurn: async (input) => next(input),
    extractSignals: async (input) => extract(input),
    summarizeStudentReflection: async (input) => summarizeStudent(input),
    summarizeClassReflection: async (input) => summarizeClass(input),
  };
}
