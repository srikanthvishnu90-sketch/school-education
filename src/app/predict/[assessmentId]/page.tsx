import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionStudent } from "@/app/_world/session";
import {
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

  const items = world.assessment.items.map((item) => ({
    id: item.id,
    prompt: item.prompt,
  }));

  return <PredictFlow assessmentId={assessmentId} items={items} />;
}
