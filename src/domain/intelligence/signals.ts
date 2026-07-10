import {
  behavioralSignalSchema,
  contextSignalSchema,
  emotionalSignalSchema,
  extractedSignalsSchema,
  technicalSignalSchema,
} from "../schemas/intelligence";

/**
 * The closed taxonomies the AI extracts from a reflection conversation (spec →
 * AI conversation logic). Closed enums are load-bearing: a summary can only be
 * built from these tags, so the model can label a moment but never invent a
 * free-form claim about a student. The technical/emotional/behavioral split is
 * what lets the summary connect emotion to learning.
 */

export type TechnicalSignal =
  | "understood_concept"
  | "misunderstood_concept"
  | "unclear_step"
  | "can_explain"
  | "independent_application"
  | "misconception"
  | "recall_difficulty"
  | "application_difficulty"
  | "reading_difficulty"
  | "time_management"
  | "careless_error"
  | "prerequisite_gap";

export type EmotionalSignal =
  | "confident"
  | "frustrated"
  | "interested"
  | "bored"
  | "embarrassed"
  | "discouraged"
  | "curious"
  | "rushed"
  | "overwhelmed"
  | "comfortable_asking_help"
  | "fear_of_mistakes"
  | "sense_of_progress";

export type BehavioralSignal =
  | "asked_for_help"
  | "avoided_help"
  | "kept_trying"
  | "stopped_working"
  | "guessed"
  | "rushed"
  | "checked_work"
  | "used_notes"
  | "relied_on_examples"
  | "collaborated"
  | "disengaged"
  | "sought_clarification"
  | "changed_strategy";

export type ContextSignal =
  | "individual_work"
  | "group_work"
  | "teacher_led"
  | "independent_work"
  | "assessment"
  | "time_pressure"
  | "peer_comparison"
  | "classroom_participation";

export interface ExtractedSignals {
  technical: TechnicalSignal[];
  emotional: EmotionalSignal[];
  behavioral: BehavioralSignal[];
  context: ContextSignal[];
}

export function createExtractedSignals(input: ExtractedSignals): ExtractedSignals {
  return Object.freeze(extractedSignalsSchema.parse(input));
}

export const TECHNICAL_SIGNALS = technicalSignalSchema.options;
export const EMOTIONAL_SIGNALS = emotionalSignalSchema.options;
export const BEHAVIORAL_SIGNALS = behavioralSignalSchema.options;
export const CONTEXT_SIGNALS = contextSignalSchema.options;
