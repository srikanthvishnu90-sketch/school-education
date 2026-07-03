import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionStudent } from "@/app/_world/session";
import { DEMO_ASSESSMENT_ID, getWorld, isKnownStudent } from "@/app/_world/world";
import ReflectFlow from "./ReflectFlow";

/**
 * Reflect entry. Requires an outcome to reflect ON (else it sends the student
 * back to predict), then loads the differentiated emotion vocabulary and hands
 * off to the cold, calm reflection flow.
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
  if (assessmentId !== DEMO_ASSESSMENT_ID || !isKnownStudent(world, studentId)) {
    notFound();
  }
  const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
    assessmentId,
    studentId,
  );
  if (outcome === null) {
    redirect(`/predict/${assessmentId}`);
  }

  const vocabulary = world.vocabulary.terms.map((t) => ({
    term: t.term,
    valence: t.valence,
  }));

  return <ReflectFlow assessmentId={assessmentId} vocabulary={vocabulary} />;
}
