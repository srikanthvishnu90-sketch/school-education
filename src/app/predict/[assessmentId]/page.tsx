import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import {
  DEFAULT_STUDENT_ID,
  DEMO_ASSESSMENT_ID,
  getWorld,
  isKnownStudent,
} from "@/app/_world/world";
import PredictFlow from "./PredictFlow";

/**
 * Predict entry. Server-loads the teacher's assessment items for a seeded
 * student, then hands off to the one-question-per-screen client flow. No auth:
 * the student is a seeded archetype, resolved from `?student=`.
 */
export default async function PredictPage({
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

  const items = world.assessment.items.map((item) => ({
    id: item.id,
    prompt: item.prompt,
  }));

  return (
    <PredictFlow
      assessmentId={assessmentId}
      studentId={studentId}
      items={items}
    />
  );
}
