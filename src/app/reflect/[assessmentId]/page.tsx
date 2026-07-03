import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import {
  DEFAULT_STUDENT_ID,
  DEMO_ASSESSMENT_ID,
  getWorld,
  isKnownStudent,
} from "@/app/_world/world";
import ReflectFlow from "./ReflectFlow";

/**
 * Reflect entry. Requires an outcome to reflect ON (else it sends the student
 * back to predict), then loads the differentiated emotion vocabulary and hands
 * off to the cold, calm reflection flow.
 */
export default async function ReflectPage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { assessmentId } = await params;
  const sp = await searchParams;
  const studentId =
    typeof sp.student === "string" ? sp.student : DEFAULT_STUDENT_ID;

  const world = await getWorld();
  if (assessmentId !== DEMO_ASSESSMENT_ID || !isKnownStudent(world, studentId)) {
    notFound();
  }
  const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
    assessmentId,
    studentId,
  );
  if (outcome === null) {
    redirect(`/predict/${assessmentId}?student=${encodeURIComponent(studentId)}`);
  }

  const vocabulary = world.vocabulary.terms.map((t) => ({
    term: t.term,
    valence: t.valence,
  }));

  return (
    <ReflectFlow
      assessmentId={assessmentId}
      studentId={studentId}
      vocabulary={vocabulary}
    />
  );
}
