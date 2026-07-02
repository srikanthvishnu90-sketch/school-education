import { DomainError, type Arousal, type Id, type Valence } from "./common";
import {
  affectSnapshotSchema,
  emotionLabelSchema,
  emotionVocabularySchema,
} from "./schemas/emotional";

/**
 * The EMOTIONAL axis — Barrett's emotional granularity. A student names states in
 * (valence, arousal) space; the product's job is to move them from a single
 * "good/bad" toward a differentiated set. It BUILDS granularity and never tells a
 * student a feeling is "wrong" (CLAUDE.md → Psychological foundation, Congruence).
 */

export interface EmotionLabel {
  term: string;
  /** Unpleasant..pleasant, [-1, 1]. */
  valence: Valence;
  /** Low..high, [0, 1]. */
  arousal: Arousal;
}

/**
 * When the snapshot was taken. Reflection happens COLD, after the feeling is
 * named — so the congruence signal uses the `post_evidence` snapshot.
 */
export type AffectPhase = "forethought" | "post_evidence";

export interface AffectSnapshot {
  id: Id;
  assessmentId: Id;
  studentId: Id;
  labels: EmotionLabel[];
  phase: AffectPhase;
  createdAt: Date;
}

/** The differentiated palette of states offered to the student to choose from. */
export interface EmotionVocabulary {
  terms: EmotionLabel[];
}

/**
 * Minimum Euclidean distance in (valence, arousal) space for two named states to
 * count as genuinely DIFFERENT. This is what stops synonym-stuffing ("happy",
 * "glad", "pleased" at the same coordinates) from inflating granularity — the
 * measure rewards real differentiation, not vocabulary volume. See CLAUDE.md →
 * Build standard ("no metric gaming").
 */
export const MIN_DISTINCT_AFFECT_DISTANCE = 0.2;

function affectDistance(a: EmotionLabel, b: EmotionLabel): number {
  return Math.hypot(a.valence - b.valence, a.arousal - b.arousal);
}

/**
 * Emotional granularity: the count of meaningfully DISTINCT states in a set of
 * labels. Labels closer than MIN_DISTINCT_AFFECT_DISTANCE collapse to one. A
 * single "good"/"bad" label scores 1 (minimal); a differentiated set scores
 * higher. Higher granularity → better regulation (Barrett).
 */
export function granularity(labels: EmotionLabel[]): number {
  const distinct: EmotionLabel[] = [];
  for (const label of labels) {
    const isDistinct = distinct.every(
      (kept) => affectDistance(kept, label) >= MIN_DISTINCT_AFFECT_DISTANCE,
    );
    if (isDistinct) {
      distinct.push(label);
    }
  }
  return distinct.length;
}

export function createEmotionLabel(input: EmotionLabel): EmotionLabel {
  return Object.freeze(emotionLabelSchema.parse(input));
}

/**
 * Rejects a snapshot that names zero states — an empty snapshot says nothing and
 * cannot feed congruence or reflection. Also validates every label's ranges.
 */
export function createAffectSnapshot(input: AffectSnapshot): AffectSnapshot {
  const parsed = affectSnapshotSchema.parse(input);
  if (parsed.labels.length === 0) {
    throw new DomainError(
      "affect snapshot must name at least one emotional state",
    );
  }
  return Object.freeze(parsed);
}

export function createEmotionVocabulary(
  input: EmotionVocabulary,
): EmotionVocabulary {
  return Object.freeze(emotionVocabularySchema.parse(input));
}
