"use server";

import type { AttributionCategory, EmotionLabel, Id } from "@/domain";
import { getWorld } from "./world";

/**
 * Server actions — the ONLY way the student surface reaches the P4 services. Each
 * is a thin, validated bridge from a client step to a domain call. Nothing here
 * decides or judges; it records what the student chose.
 *
 * The emotional step has no action of its own that must run: skipping it simply
 * never calls `recordAffect`, so nothing is written and nothing is triggered.
 */

export interface SubmitPredictionInput {
  studentId: Id;
  assessmentId: Id;
  /** One confidence per item, in the assessment's item order. */
  confidences: number[];
  globalPredicted: number;
}

/**
 * Registers the pre-registered prediction, then reveals the outcome (the fixed
 * answer key). Prediction strictly precedes outcome via the injected clock.
 */
export async function recordPrediction(
  input: SubmitPredictionInput,
): Promise<void> {
  const world = await getWorld();
  const items = world.assessment.items;

  await world.services.capturePrediction({
    studentId: input.studentId,
    assessmentId: input.assessmentId,
    itemPredictions: items.map((item, i) => ({
      itemId: item.id,
      confidence: input.confidences[i],
    })),
    globalPredicted: input.globalPredicted,
  });

  const key = world.answerKey[input.studentId] ?? [];
  await world.services.recordOutcome({
    studentId: input.studentId,
    assessmentId: input.assessmentId,
    itemOutcomes: items.map((item, i) => ({
      itemId: item.id,
      correct: key[i] === true,
      pointsAwarded: key[i] === true ? 1 : 0,
    })),
  });
}

export interface RecordAffectInput {
  studentId: Id;
  assessmentId: Id;
  /** Vocabulary terms the student chose. Empty is never submitted (skip instead). */
  terms: string[];
}

/**
 * Records the OPTIONAL emotional decompose. Only ever called when the student
 * named at least one state; skipping the step calls this never.
 */
export async function recordAffect(input: RecordAffectInput): Promise<void> {
  if (input.terms.length === 0) return;
  const world = await getWorld();
  const byTerm = new Map<string, EmotionLabel>(
    world.vocabulary.terms.map((t) => [t.term, t]),
  );
  const labels = input.terms
    .map((term) => byTerm.get(term))
    .filter((l): l is EmotionLabel => l !== undefined);
  if (labels.length === 0) return;

  await world.services.captureAffect({
    studentId: input.studentId,
    assessmentId: input.assessmentId,
    labels,
    phase: "post_evidence",
  });
}

export interface RecordReflectionInput {
  studentId: Id;
  assessmentId: Id;
  category: AttributionCategory;
  specific: boolean;
  controllable: boolean;
  note: string;
  actionText: string;
  /** ISO date string for the next action's due date. */
  dueByISO: string;
}

/**
 * Records the reflection (constrained attribution) and its one committed next
 * action. The domain rejects a non-productive attribution — the surface only
 * reaches here once the attribution is specific AND controllable.
 */
export async function recordReflection(
  input: RecordReflectionInput,
): Promise<void> {
  const world = await getWorld();
  await world.services.submitReflection({
    studentId: input.studentId,
    assessmentId: input.assessmentId,
    attribution: {
      category: input.category,
      specific: input.specific,
      controllable: input.controllable,
      note: input.note,
    },
    nextAction: {
      text: input.actionText,
      dueBy: new Date(input.dueByISO),
    },
    exemplarReviewed: true,
  });
}
