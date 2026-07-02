import type { z } from "zod";

import type {
  Assessment,
  AssessmentItem,
  Misconception,
  Skill,
} from "../skill";
import type { LearningGoal } from "../goal";
import type { ItemPrediction, Prediction } from "../prediction";
import type { ItemOutcome, Outcome } from "../outcome";
import type { Attribution, NextAction, Reflection } from "../reflection";
import type { LearningMap, MasteryBand } from "../learningMap";
import type { CalibrationRecord } from "../calibration";
import type { TransferProbe } from "../transferProbe";
import type {
  ActionVerification,
  SkillDrift,
  SkillMeasure,
} from "../verification";
import type {
  AffectSnapshot,
  EmotionLabel,
  EmotionVocabulary,
} from "../emotion";

import type {
  assessmentItemSchema,
  assessmentSchema,
  attributionSchema,
  calibrationRecordSchema,
  itemOutcomeSchema,
  itemPredictionSchema,
  learningGoalSchema,
  learningMapSchema,
  actionVerificationSchema,
  masteryBandSchema,
  misconceptionSchema,
  nextActionSchema,
  outcomeSchema,
  predictionSchema,
  reflectionSchema,
  skillDriftSchema,
  skillMeasureSchema,
  skillSchema,
  transferProbeSchema,
} from "./academic";
import type {
  affectSnapshotSchema,
  emotionLabelSchema,
  emotionVocabularySchema,
} from "./emotional";

/**
 * Compile-time guarantee that every hand-written domain interface stays exactly
 * in sync with its Zod schema. If a field drifts on either side, `Expect<...>`
 * fails to resolve to `true` and `pnpm typecheck` (tsc) errors. Nothing here runs
 * at runtime — it is pure type-level assertion. See CLAUDE.md → Build standard.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// Academic axis
export type _SkillSync = Expect<Equal<Skill, z.infer<typeof skillSchema>>>;
export type _MisconceptionSync = Expect<
  Equal<Misconception, z.infer<typeof misconceptionSchema>>
>;
export type _AssessmentItemSync = Expect<
  Equal<AssessmentItem, z.infer<typeof assessmentItemSchema>>
>;
export type _AssessmentSync = Expect<
  Equal<Assessment, z.infer<typeof assessmentSchema>>
>;
export type _LearningGoalSync = Expect<
  Equal<LearningGoal, z.infer<typeof learningGoalSchema>>
>;
export type _ItemPredictionSync = Expect<
  Equal<ItemPrediction, z.infer<typeof itemPredictionSchema>>
>;
export type _PredictionSync = Expect<
  Equal<Prediction, z.infer<typeof predictionSchema>>
>;
export type _ItemOutcomeSync = Expect<
  Equal<ItemOutcome, z.infer<typeof itemOutcomeSchema>>
>;
export type _OutcomeSync = Expect<
  Equal<Outcome, z.infer<typeof outcomeSchema>>
>;
export type _AttributionSync = Expect<
  Equal<Attribution, z.infer<typeof attributionSchema>>
>;
export type _NextActionSync = Expect<
  Equal<NextAction, z.infer<typeof nextActionSchema>>
>;
export type _ReflectionSync = Expect<
  Equal<Reflection, z.infer<typeof reflectionSchema>>
>;
export type _MasteryBandSync = Expect<
  Equal<MasteryBand, z.infer<typeof masteryBandSchema>>
>;
export type _LearningMapSync = Expect<
  Equal<LearningMap, z.infer<typeof learningMapSchema>>
>;
export type _CalibrationRecordSync = Expect<
  Equal<CalibrationRecord, z.infer<typeof calibrationRecordSchema>>
>;
export type _TransferProbeSync = Expect<
  Equal<TransferProbe, z.infer<typeof transferProbeSchema>>
>;
export type _SkillMeasureSync = Expect<
  Equal<SkillMeasure, z.infer<typeof skillMeasureSchema>>
>;
export type _SkillDriftSync = Expect<
  Equal<SkillDrift, z.infer<typeof skillDriftSchema>>
>;
export type _ActionVerificationSync = Expect<
  Equal<ActionVerification, z.infer<typeof actionVerificationSchema>>
>;

// Emotional axis
export type _EmotionLabelSync = Expect<
  Equal<EmotionLabel, z.infer<typeof emotionLabelSchema>>
>;
export type _AffectSnapshotSync = Expect<
  Equal<AffectSnapshot, z.infer<typeof affectSnapshotSchema>>
>;
export type _EmotionVocabularySync = Expect<
  Equal<EmotionVocabulary, z.infer<typeof emotionVocabularySchema>>
>;
