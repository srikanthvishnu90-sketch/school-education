"use server";

import { revalidatePath } from "next/cache";
import type { Id } from "@/domain";
import { getSessionUser } from "./session";
import { getTeacherWorld } from "./teacher";

/**
 * Acknowledging a flag records FlagAcknowledgement { flagId, teacherId, at },
 * which feeds back into the agent's observation so it stops re-raising the same
 * flag. Teacher-only; the acting teacher is taken from the session.
 */
export async function acknowledgeFlag(studentId: Id): Promise<void> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") {
    throw new Error("not a teacher");
  }
  const teacher = await getTeacherWorld();
  await teacher.service.acknowledge(studentId, user.id);
  revalidatePath(`/class/${teacher.classId}/flags`);
}
