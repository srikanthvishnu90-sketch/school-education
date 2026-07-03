"use server";

import type { AttributionCategory, EmotionLabel, Id, PilotEventType } from "@/domain";
import { getSessionStudent } from "./session";
import { assessmentById, cycleNumberOf, getWorld, type World } from "./world";

const DEFAULT_TENANT = "school-1";

/**
 * Emit one pilot telemetry event (P17). Mechanics only, consent-gated and
 * pseudonymized inside the recorder — a no-op without the telemetry scope. Never
 * carries free text; failures never break the student flow.
 */
async function emit(
  world: World,
  studentId: Id,
  assessmentId: Id,
  type: PilotEventType,
): Promise<void> {
  const cycleN = cycleNumberOf(world, assessmentId) ?? 1;
  try {
    await world.telemetry.record({ studentId, tenantId: DEFAULT_TENANT, type, cycleN });
  } catch {
    // Telemetry must never interrupt the student's cycle.
  }
}

/**
 * Server actions — the ONLY way the student surface reaches the P4 services. The
 * acting student is taken from the SESSION, never from the client, so one student
 * can never write as another. Each action is a thin, validated bridge to a domain
 * call; nothing here decides or judges.
 */

async function requireStudent(): Promise<Id> {
  const studentId = await getSessionStudent();
  if (studentId === null) throw new Error("not signed in");
  return studentId;
}

export interface SubmitPredictionInput {
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
  const studentId = await requireStudent();
  const world = await getWorld();
  const assessment = assessmentById(world, input.assessmentId);
  if (assessment === null) throw new Error(`unknown assessment ${input.assessmentId}`);
  const items = assessment.items;

  await emit(world, studentId, input.assessmentId, "cycle_started");

  const prediction = await world.services.capturePrediction({
    studentId,
    assessmentId: input.assessmentId,
    itemPredictions: items.map((item, i) => ({
      itemId: item.id,
      confidence: input.confidences[i],
    })),
    globalPredicted: input.globalPredicted,
  });
  await emit(world, studentId, input.assessmentId, "prediction_completed");

  // The quarantine mechanic (P15→P17) is emitted from the application layer, which
  // reads ResponseQuality; the student surface never touches it.
  try {
    await world.telemetry.noteQuarantine({
      studentId,
      tenantId: DEFAULT_TENANT,
      sessionId: prediction.id,
      cycleN: cycleNumberOf(world, input.assessmentId) ?? 1,
    });
  } catch {
    // never interrupt the cycle
  }

  const key = world.answerKey[input.assessmentId]?.[studentId] ?? [];
  await world.services.recordOutcome({
    studentId,
    assessmentId: input.assessmentId,
    itemOutcomes: items.map((item, i) => ({
      itemId: item.id,
      correct: key[i] === true,
      pointsAwarded: key[i] === true ? 1 : 0,
    })),
  });
}

export interface RecordAffectInput {
  assessmentId: Id;
  /** Vocabulary terms the student chose. Empty is never submitted (skip instead). */
  terms: string[];
}

/**
 * Records the OPTIONAL emotional decompose. Only ever called when the student
 * named at least one state; skipping the step calls this never. The domain
 * refuses if the affect consent scope is not granted (P12).
 */
export async function recordAffect(input: RecordAffectInput): Promise<void> {
  if (input.terms.length === 0) return;
  const studentId = await requireStudent();
  const world = await getWorld();
  const byTerm = new Map<string, EmotionLabel>(
    world.vocabulary.terms.map((t) => [t.term, t]),
  );
  const labels = input.terms
    .map((term) => byTerm.get(term))
    .filter((l): l is EmotionLabel => l !== undefined);
  if (labels.length === 0) return;

  await world.services.captureAffect({
    studentId,
    assessmentId: input.assessmentId,
    labels,
    phase: "post_evidence",
  });
  await emit(world, studentId, input.assessmentId, "affect_completed");
}

/**
 * Records that the OPTIONAL emotional step was SKIPPED (P17 telemetry only). Skip
 * is a healthy pressure-release valve — tracked, never fought. Nothing about the
 * feeling is stored; only the mechanic that the step was skipped.
 */
export async function recordAffectSkip(assessmentId: Id): Promise<void> {
  const studentId = await requireStudent();
  const world = await getWorld();
  await emit(world, studentId, assessmentId, "affect_skipped");
}

export interface RecordReflectionInput {
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
  const studentId = await requireStudent();
  const world = await getWorld();
  await world.services.submitReflection({
    studentId,
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
  // The reflection and its committed action close the cycle (P17 mechanics).
  await emit(world, studentId, input.assessmentId, "reflection_completed");
  await emit(world, studentId, input.assessmentId, "action_committed");
  await emit(world, studentId, input.assessmentId, "cycle_completed");
}
