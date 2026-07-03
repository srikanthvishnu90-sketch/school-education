import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { createDeterministicLanguageCapability } from "@/adapters/language";
import { getSessionStudent } from "@/app/_world/session";
import {
  assessmentById,
  getWorld,
  isKnownAssessment,
  isKnownStudent,
  SKILL_NAMES,
} from "@/app/_world/world";
import { buildReflectionProbes, type WrongItem } from "@/domain";
import ReflectFlow from "./ReflectFlow";

/**
 * Reflect entry. Requires an outcome to reflect ON (else it sends the student
 * back to predict), then FORMULATES the detailed, item-by-item reflection
 * questions from the teacher's exam items and the student's own missed items, and
 * hands off to the cold, calm reflection flow.
 *
 * Question formulation runs on the deterministic language capability — zero-LLM,
 * so reflection always works; a model may only make the phrasing read better.
 */
export default async function ReflectPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}): Promise<ReactElement> {
  const { assessmentId } = await params;
  const studentId = await getSessionStudent();
  if (studentId === null) redirect("/signin");

  const world = await getWorld();
  const assessment = assessmentById(world, assessmentId);
  if (
    assessment === null ||
    !isKnownAssessment(world, assessmentId) ||
    !isKnownStudent(world, studentId)
  ) {
    notFound();
  }
  const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
    assessmentId,
    studentId,
  );
  if (outcome === null) {
    redirect(`/predict/${assessmentId}`);
  }

  // The exam items the student missed become the spine of the reflection.
  const missed = new Set(
    outcome.itemOutcomes.filter((o) => !o.correct).map((o) => o.itemId),
  );
  const wrongItems: WrongItem[] = assessment.items
    .filter((item) => missed.has(item.id))
    .map((item) => ({
      prompt: item.prompt,
      skillName: SKILL_NAMES[item.skillId] ?? "this work",
    }));

  const language = createDeterministicLanguageCapability();
  const { probes, truncated } = buildReflectionProbes(
    wrongItems,
    (template, slots) => language.renderQuestion(template, slots),
  );

  const vocabulary = world.vocabulary.terms.map((t) => ({
    term: t.term,
    valence: t.valence,
  }));

  return (
    <ReflectFlow
      assessmentId={assessmentId}
      vocabulary={vocabulary}
      probes={probes}
      truncated={truncated}
    />
  );
}
