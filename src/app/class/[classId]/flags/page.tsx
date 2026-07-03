import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { getTeacherWorld, studentDisplayName } from "@/app/_world/teacher";
import FlagsList, { type FlagView } from "./FlagsList";

/**
 * The flags view — ONLY the agent's flag_to_teacher items (severe/persistent
 * gaps). Each is described in TASK language, never about the child, with a
 * suggested instructional move and an acknowledge action.
 */
export default async function FlagsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}): Promise<ReactElement> {
  const { classId } = await params;
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") redirect("/signin");

  const teacher = await getTeacherWorld();
  if (classId !== teacher.classId) notFound();

  const raw = await teacher.service.flags(
    teacher.mainAssessmentId,
    teacher.studentIds,
  );
  const flags: FlagView[] = raw.map((f) => ({
    studentId: f.studentId,
    studentName: studentDisplayName(f.studentId),
    skillName: f.skillName,
    pattern: f.pattern,
    suggestedMove: f.suggestedMove,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
            Flags
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
            Where a student may need you
          </h1>
        </div>
        <Link
          href={`/class/${classId}`}
          className="rounded-control border border-ink-wash bg-white px-4 py-2 text-sm text-ink-black transition-colors hover:border-ink-tint/50"
        >
          Class
        </Link>
      </div>

      <FlagsList flags={flags} />
    </main>
  );
}
