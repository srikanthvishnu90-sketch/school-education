import { z } from "zod";
import { arousalSchema, idSchema, valenceSchema } from "./common";

/**
 * Zod schemas for the EMOTIONAL axis — Barrett's emotional granularity. The
 * product's job here is to move a student from "good/bad" toward differentiated,
 * specific states. A state is a term placed in (valence, arousal) space; a
 * snapshot is the set a student names at one moment. See CLAUDE.md → Psychological
 * foundation and "Congruence is a flag, never a verdict".
 */

export const emotionLabelSchema = z.object({
  term: z.string().min(1),
  valence: valenceSchema,
  arousal: arousalSchema,
});

export const affectPhaseSchema = z.enum(["forethought", "post_evidence"]);

export const affectSnapshotSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  studentId: idSchema,
  // At least one named state — a snapshot with zero labels says nothing and is
  // rejected by the factory (enforced there, since Zod min(1) on the array is a
  // shape rule and the intent is a domain invariant we test explicitly).
  labels: z.array(emotionLabelSchema),
  phase: affectPhaseSchema,
  createdAt: z.date(),
});

export const emotionVocabularySchema = z.object({
  terms: z.array(emotionLabelSchema),
});
