import {
  createLessonAnalysis,
  type LessonAnalysis,
} from "@/domain/intelligence/lesson";
import {
  createReflectionQuestionSet,
  type GeneratedQuestion,
  type QuestionCategory,
  type ReflectionQuestionSet,
} from "@/domain/intelligence/question";
import {
  isReflectionUncertaintyOrSkip,
  studentAnswers,
  type ReflectionStage,
} from "@/domain/intelligence/session";
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

const UNCERTAIN_OPTION = "I'm not sure";
/**
 * An OPTIONAL vocabulary assist for the free-text emotion beat — suggestions to
 * widen a student's feeling words (Barrett granularity), never a closed picker and
 * never required. The chat shows these as tap-to-start chips above a text box; the
 * student can pick one, edit it, or ignore them entirely and write their own.
 */
const EMOTION_VOCABULARY = [
  "Calm",
  "Curious",
  "Confused",
  "Frustrated",
  "Rushed",
  "Discouraged",
  "Proud",
];
const PREDICTION_OPTIONS = [
  "Not at all",
  "A little",
  "Somewhat",
  "Mostly",
  "Completely",
  UNCERTAIN_OPTION,
];

const UNSAFE_PROMPT_ANCHOR =
  /\b(good at|bad at|good student|bad student|smart|dumb|stupid|gifted|math person|kind of learner|natural at|students? (?:got stuck|were confused|felt frustrated|failed))\b/i;

/**
 * Keep teacher-authored lesson details usable inside a short student prompt.
 * Quotation marks are normalized because the anchor is quoted in the generated
 * questions; no meaning is inferred from the text.
 */
function compactPromptAnchor(value: string): string {
  const compact = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[“”"]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:,\s]+$/, "");
  if (compact.length <= 140) return compact;
  return compact
    .slice(0, 140)
    .replace(/\s+\S*$/, "")
    .trim();
}

function safePromptAnchor(value: string | undefined): string | null {
  if (value === undefined) return null;
  const compact = compactPromptAnchor(value);
  if (
    compact.length === 0 ||
    compact.includes("?") ||
    UNSAFE_PROMPT_ANCHOR.test(compact)
  ) {
    return null;
  }
  return compact;
}

/**
 * The final clause usually describes what students most recently DID (for
 * example, "then students completed six problems"). It is stronger episodic
 * evidence for a reflection prompt than a generic topic label.
 */
function recentLessonEpisode(content: string): string {
  const sentences = content
    .replace(/[\r\n\t]+/g, " ")
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const latestSentence = sentences.at(-1) ?? content;
  const clauses = latestSentence
    .split(/\b(?:then|next|finally|afterward|afterwards)\b[,:]?\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return compactPromptAnchor(clauses.at(-1) ?? latestSentence);
}

/**
 * Prefer the analyzed recent task/step for retrospective questions. Every
 * fallback remains about this lesson rather than inventing a student trait or
 * assuming that a particular moment was difficult.
 */
function taskAnchorFor(analysis: LessonAnalysis): string {
  const candidate = [
    analysis.technicalSteps.at(-1),
    analysis.independentApplication[0],
    analysis.difficultTransitions[0],
    analysis.objectives[0],
    analysis.topic,
  ]
    .map(safePromptAnchor)
    .find((value): value is string => value !== null);
  return candidate ?? "the assigned activity";
}

/** A prediction targets the teacher's learning objective when one was supplied. */
function predictionAnchorFor(analysis: LessonAnalysis): string {
  return safePromptAnchor(analysis.objectives[0]) ?? taskAnchorFor(analysis);
}

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

function stageForQuestion(
  q: GeneratedQuestion,
  order: number,
): ReflectionStage {
  return order === 0 ? "overall" : STAGE_BY_CATEGORY[q.category];
}

// Keyword → signal rules. Any number can fire per conversation; deduped.
const TECHNICAL_RULES: readonly [RegExp, TechnicalSignal][] = [
  [/\b(made sense|understood|got it|i get it|clear)\b/i, "understood_concept"],
  [
    /\b(confus\w*|didn'?t (get|understand)|lost|no idea what)\b/i,
    "misunderstood_concept",
  ],
  [
    /\b(which (method|way|formula)|where to start|how to (begin|start))\b/i,
    "application_difficulty",
  ],
  [/\b(forgot|couldn'?t remember|blanked|which step)\b/i, "recall_difficulty"],
  [
    /\b(ran out of time|no time|rushed the|didn'?t finish)\b/i,
    "time_management",
  ],
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
  [
    /\b(asked (for help|the teacher|a question)|raised my hand)\b/i,
    "asked_for_help",
  ],
  [
    /\b(didn'?t ask|too (embarrassed|scared) to ask|waited|stayed quiet)\b/i,
    "avoided_help",
  ],
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
  [
    /\b(everyone else|others finished|classmates|other people)\b/i,
    "peer_comparison",
  ],
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
  if (
    t.includes("understood_concept") &&
    (t.includes("application_difficulty") ||
      t.includes("misunderstood_concept"))
  )
    return "Followed the guided examples but was unsure how to apply the concept independently.";
  if (t.includes("misunderstood_concept"))
    return "Reported confusion about the core concept.";
  if (t.includes("recall_difficulty"))
    return "Had trouble recalling a needed step.";
  if (t.includes("understood_concept"))
    return "Reported understanding the concept.";
  return "Understanding is unclear from this reflection.";
}

function emotionalPhrase(s: ExtractedSignals): string {
  const e = s.emotional;
  if (e.includes("embarrassed"))
    return "Reported feeling embarrassed at a difficult moment.";
  if (e.includes("discouraged"))
    return "Reported feeling discouraged after a mistake.";
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
  if (b.includes("stopped_working"))
    return "Stopped working after getting stuck.";
  if (b.includes("kept_trying")) return "Kept trying after getting stuck.";
  if (b.includes("guessed")) return "Guessed when unsure.";
  if (b.includes("used_notes")) return "Leaned on notes or examples.";
  return "Learning behavior was not clear from this reflection.";
}

function relationshipPhrase(s: ExtractedSignals): string {
  const { emotional: e, behavioral: b, technical: t } = s;
  if (e.includes("embarrassed") && b.includes("avoided_help"))
    return "The reflection included both feeling embarrassed and not asking for help in the same episode.";
  if (e.includes("rushed") && t.includes("careless_error"))
    return "The reflection included both feeling rushed and a reported avoidable error.";
  if (b.includes("avoided_help") && t.includes("misunderstood_concept"))
    return "The reflection included both confusion and not asking for help.";
  if (e.includes("confident") && t.includes("understood_concept"))
    return "The reflection included both reported confidence and reported understanding.";
  return "No same-episode relationship had direct support in this reflection.";
}

function actionsFor(s: ExtractedSignals): string[] {
  const out: string[] = [];
  if (
    s.behavioral.includes("avoided_help") ||
    s.emotional.includes("embarrassed")
  )
    out.push("Ask for a private, low-pressure check-in.");
  if (
    s.technical.includes("application_difficulty") ||
    s.technical.includes("misunderstood_concept")
  )
    out.push("Use a first-step checklist before choosing a method.");
  if (s.emotional.includes("rushed") || s.context.includes("time_pressure"))
    out.push("Try one calm warm-up without a timer.");
  if (out.length === 0)
    out.push("Try one quick independent example next class.");
  return out;
}

function studentFacing(s: ExtractedSignals, action: string): string {
  const tech = s.technical.includes("application_difficulty")
    ? "You shared that choosing a first step on your own was uncertain. "
    : "You described what happened in today's work. ";
  const feel = s.emotional.includes("embarrassed")
    ? "You also mentioned embarrassment and asking for help. "
    : "";
  return `${tech}${feel}One next step you can choose: ${action.toLowerCase().replace(/\.$/, "")}.`;
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

function attentionGroupFor(
  s: ExtractedSignals,
): AttentionStudent["group"] | null {
  const understood = s.technical.includes("understood_concept");
  const confused =
    s.technical.includes("misunderstood_concept") ||
    s.technical.includes("application_difficulty");
  const lowConf = s.emotional.some((e) => LOW_CONFIDENCE_EMOTIONS.includes(e));
  if (s.behavioral.includes("avoided_help")) return "repeated_help_avoidance";
  if (
    s.emotional.includes("sense_of_progress") &&
    s.behavioral.includes("kept_trying")
  )
    return "positive_improvement";
  if (confused && lowConf) return "low_understanding_low_confidence";
  if (understood && lowConf) return "high_understanding_low_confidence";
  if (confused && s.emotional.includes("confident"))
    return "low_understanding_high_confidence";
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
    const recentEpisode = recentLessonEpisode(lesson.content);
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
      // Preserve a concrete teacher-authored episode for downstream prompts.
      technicalSteps: recentEpisode.length > 0 ? [recentEpisode] : [],
      misconceptions: [],
      difficultTransitions: [],
      independentApplication,
      emotionalPressurePoints: pressure,
      reflectionFocus,
      // Pass the teacher's worked example through untouched — the generator uses
      // it to close with an exemplar-grounded self-comparison (feedback that teaches).
      exemplar: lesson.exemplar,
      createdAt: now(),
    });
  }

  function generate(input: GenerateQuestionsInput): ReflectionQuestionSet {
    const { analysis, depth, adaptiveFollowups } = input;
    const topic = safePromptAnchor(analysis.topic) ?? "the assigned activity";
    const taskAnchor = taskAnchorFor(analysis);
    const predictionAnchor = predictionAnchorFor(analysis);
    const episode = `this part of today's lesson on ${topic}: "${taskAnchor}"`;
    // Grade-band register: K-2 and 3-5 get shorter sentences and plainer words with
    // the SAME meaning and the SAME {episode}/{predictionAnchor} anchors. The
    // structure — categories, formats, options, order, counts — is identical to the
    // default register; only the question TEXT changes. 6-8 / 9-12 / untagged keep
    // the standard wording below.
    const younger =
      input.gradeLevel === "k_2" || input.gradeLevel === "3_5";
    // Ordered pool = the Zimmerman arc, and every prompt is FREE-RESPONSE so the
    // student writes in their own words (no closed pickers). It dissects two
    // dimensions at once — the MENTAL/psychological (forethought goal, feeling) and
    // the TECHNICAL (a retrieval-practice mastery demonstration, then where it broke).
    //   0 forethought (mental) · 1 mastery-retrieval (technical, evidence of learning)
    //   2 feeling (mental) · 3 what-you-did (behavioral) · 4 confidence prediction
    //   (the ONE structured item — calibration's Brier/bias need a number) · 5 next step
    // The technical (index 1) and emotional (index 2) beats sit within every 4–6
    // slice, so the balance invariant holds for SHORTER(4)/STANDARD(5)/DEEPER(6).
    const pool: Omit<GeneratedQuestion, "id" | "order">[] = [
      {
        // Forethought recall (Zimmerman beat 1) — the MENTAL frame: recall the goal
        // before reviewing what happened. Free-text, the student's own words.
        category: "metacognitive",
        text: younger
          ? `Before ${episode}, what were you trying to do?`
          : `Before ${episode}, what were you trying to figure out or get right?`,
        format: "short_response",
        required: true,
        aiGenerated: true,
      },
      {
        // Mastery via retrieval practice (testing effect) — the TECHNICAL evidence:
        // the student re-derives and EXPLAINS the actual skill, showing essential
        // mastery of the topic rather than picking a canned option. Long free-text.
        category: "technical",
        text: younger
          ? `In your own words, how would you do one example from ${episode}, step by step, so a friend could follow it?`
          : `In your own words, how would you work through one example from ${episode}, step by step, so someone else could follow it?`,
        format: "long_response",
        required: true,
        aiGenerated: true,
      },
      {
        // Self-reflection feeling (beat 3) — the MENTAL/psychological dimension,
        // FREE-TEXT FIRST (Barrett granularity). The words below are an OPTIONAL
        // vocabulary assist shown as suggestions, never a closed picker.
        category: "emotional",
        text: younger
          ? `Thinking about ${episode}, how did that part feel? Use your own words.`
          : `Thinking about ${episode}, how did that part feel? Say it in your own words.`,
        format: "short_response",
        options: EMOTION_VOCABULARY,
        required: true,
        aiGenerated: true,
      },
      {
        // What they did (behavioral) — free-text, so the strategy is in their words.
        category: "behavioral",
        text: younger
          ? `Right after a hard step in ${episode}, what did you do next?`
          : `Right after a tricky step in ${episode}, what did you do next?`,
        format: "short_response",
        required: false,
        aiGenerated: true,
      },
      {
        // The ONE structured item: a confidence prediction. Calibration (Brier/bias
        // = confidence vs. correctness) is plumb's core, and it needs a number to
        // compare against the real score, so this stays a scale by design.
        category: "metacognitive",
        text: younger
          ? `Before you see your score for "${predictionAnchor}", how much do you think you got right?`
          : `Before seeing your score or an answer key for "${predictionAnchor}", how much of that work do you predict you completed correctly?`,
        format: "rating",
        options: PREDICTION_OPTIONS,
        required: false,
        aiGenerated: true,
      },
      analysis.exemplar !== undefined && analysis.exemplar.trim().length > 0
        ? {
            // Feedback against a CORRECT exemplar (Kluger & DeNisi), placed LAST so
            // the student attempts the skill from memory first (retrieval practice),
            // then compares against the teacher's worked example. The exemplar rides
            // as structured data so the chat shows it as a reference panel.
            category: "metacognitive",
            text: younger
              ? `Look at this example next to your work. What is one thing you would do differently next time?`
              : `Compare your work to this example. What is one step you'd do differently next time?`,
            format: "short_response",
            exemplar: analysis.exemplar.trim().slice(0, 600),
            required: false,
            aiGenerated: true,
          }
        : {
            // No exemplar on file → the generic feed-forward (Hattie) next step.
            category: "metacognitive",
            text: younger
              ? `For your next task on "${predictionAnchor}", what is one small step you would try first?`
              : `For the next task based on "${predictionAnchor}", what is one small step you would try first?`,
            format: "short_response",
            required: false,
            aiGenerated: true,
          },
    ];

    const questions: GeneratedQuestion[] = pool
      .slice(0, DEPTH_COUNT[depth])
      .map((q, order) => ({
        ...q,
        id: `${analysis.lessonId}-q${order}`,
        order,
      }));

    return createReflectionQuestionSet({
      // AI drafts are NEVER self-approving — a teacher must approve before students see them.
      approvedAt: null,
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

    // Loop closure (Zimmerman): when the student carried a next step in from their
    // previous reflection, the FIRST beat revisits it before any new question. This
    // is what closes the cycle — a later session checks what came of the earlier
    // commitment. It shifts every downstream question by one (the offset).
    const carried = session.carriedAction;
    const offset = carried !== undefined ? 1 : 0;
    const answered = answers.length;
    if (offset === 1 && answered === 0) {
      return {
        kind: "question",
        stage: "overall",
        category: "metacognitive",
        text: `Last time, you chose to try this: "${carried}". What happened when you tried it?`,
        format: "short_response",
        required: false,
      };
    }

    const primaries = questionSet.questions;
    const primaryIndex = answered - offset;
    if (primaryIndex < primaries.length) {
      const q = primaries[primaryIndex];
      return {
        kind: "question",
        stage: stageForQuestion(q, primaryIndex),
        category: q.category,
        text: q.text,
        format: q.format,
        options: q.options,
        required: q.required,
        exemplar: q.exemplar,
      };
    }
    // All primaries answered: one clarifying follow-up if the last reply was
    // vague and follow-ups remain; otherwise there is enough to summarize.
    const followupsUsed = primaryIndex - primaries.length;
    if (
      followupsUsed < questionSet.maxFollowups &&
      latest !== undefined &&
      !isReflectionUncertaintyOrSkip(latest.text) &&
      isVague(latest.text)
    ) {
      return {
        kind: "question",
        stage: "support",
        category: "metacognitive",
        text: "What is one more detail about what happened in that moment of today's task?",
        format: "short_response",
        required: false,
      };
    }
    return { kind: "summary" };
  }

  function extract(input: ExtractSignalsInput): ExtractedSignals {
    const text = studentAnswers(input.session)
      .filter((message) => !isReflectionUncertaintyOrSkip(message.text))
      .map((m) => m.text)
      .join("\n");
    return createExtractedSignals({
      technical: matchAll(text, TECHNICAL_RULES),
      emotional: matchAll(text, EMOTIONAL_RULES),
      behavioral: matchAll(text, BEHAVIORAL_RULES),
      context: matchAll(text, CONTEXT_RULES),
    });
  }

  function summarizeStudent(
    input: SummarizeStudentInput,
  ): StudentInsightSummary {
    const { session, signals } = input;
    const answers = studentAnswers(session)
      .map((m) => m.text.trim())
      .filter(
        (answer) => answer.length > 0 && !isReflectionUncertaintyOrSkip(answer),
      );
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
      evidence:
        answers.length > 0
          ? answers
          : ["No free-text responses were recorded."],
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
      (s) =>
        s.emotional.includes("embarrassed") ||
        s.behavioral.includes("avoided_help"),
    );
    const rushed = count(
      (s) =>
        s.emotional.includes("rushed") || s.context.includes("time_pressure"),
    );
    const confusionWithLowConfidence = count(
      (s) =>
        (s.technical.includes("misunderstood_concept") ||
          s.technical.includes("application_difficulty")) &&
        (s.emotional.includes("embarrassed") ||
          s.emotional.includes("discouraged") ||
          s.emotional.includes("fear_of_mistakes")),
    );
    const embarrassmentWithHelpAvoidance = count(
      (s) =>
        s.emotional.includes("embarrassed") &&
        s.behavioral.includes("avoided_help"),
    );

    const attentionStudents: AttentionStudent[] = input.students
      .map((x): AttentionStudent | null => {
        const group = attentionGroupFor(x.signals);
        return group ? { studentId: x.studentId, group } : null;
      })
      .filter((x): x is AttentionStudent => x !== null);

    const keyRelationship =
      embarrassmentWithHelpAvoidance > 0
        ? `${embarrassmentWithHelpAvoidance} of ${n} reported both feeling embarrassed and not asking for help in the same reflection.`
        : confusionWithLowConfidence > 0
          ? `${confusionWithLowConfidence} of ${n} reported both confusion and a low-confidence feeling in the same reflection.`
          : "No same-student technical–emotional relationship had direct support in these reflections.";

    return createClassInsightSummary({
      id: `${input.reflectionId}-class`,
      classId: input.classId,
      reflectionId: input.reflectionId,
      technicalSummary: `${understood} of ${n} reported understanding the concept; ${confused} reported confusion or trouble applying it independently.`,
      emotionalSummary: `${lowConfidence} of ${n} reported embarrassment or avoiding help; ${rushed} reported feeling rushed or time pressure.`,
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
