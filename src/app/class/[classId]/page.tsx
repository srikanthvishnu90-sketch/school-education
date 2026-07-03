import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { getTeacherWorld } from "@/app/_world/teacher";

/**
 * The class view — the teacher's default surface. It opens on answers: a skill
 * calibration heat-list (where the class is most blindsided or underconfident)
 * and a follow-through strip. Instructional signal, never surveillance: no names
 * on the follow-through, no affect, no reflection text, no per-student browsing.
 * Alignment is ink-tint, a gap is warm — never red/green.
 */
const ALIGNED_EPS = 0.15;

export default async function ClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}): Promise<ReactElement> {
  const { classId } = await params;
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") redirect("/signin");

  const teacher = await getTeacherWorld();
  if (classId !== teacher.classId) notFound();

  const { calibration, followThrough } = await teacher.service.classSignals(
    teacher.assessmentIds,
    teacher.studentIds,
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
            Your class
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
            Where the class is blindsided
          </h1>
        </div>
        <Link
          href={`/class/${classId}/flags`}
          className="rounded-control border border-ink-wash bg-white px-4 py-2 text-sm text-ink-black transition-colors hover:border-ink-tint/50"
        >
          Flags
        </Link>
      </div>

      {/* Skill calibration heat-list. */}
      <div className="mt-8 space-y-px overflow-hidden rounded-card border border-ink-wash">
        {calibration.map((row) => {
          if (!row.sufficient || row.meanBias === null || row.meanAccuracy === null) {
            return (
              <div key={row.skillId} className="bg-white p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-medium text-ink-black">
                    {row.skillName}
                  </span>
                  <span className="text-[13px] text-secondary">
                    not enough evidence yet
                  </span>
                </div>
              </div>
            );
          }
          const gap = Math.abs(row.meanBias) > ALIGNED_EPS;
          const tone = gap ? "var(--color-gap)" : "var(--color-aligned)";
          const direction = row.meanBias > 0 ? "ahead of" : "behind";
          return (
            <div key={row.skillId} className="flex gap-4 bg-white p-5">
              <span
                aria-hidden
                className="mt-1 block w-1 shrink-0 self-stretch rounded-full"
                style={{ backgroundColor: tone }}
              />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-medium text-ink-black">
                    {row.skillName}
                  </span>
                  <span className="text-[13px] text-secondary">
                    {row.n} students
                  </span>
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-secondary">
                  {gap
                    ? `Class confidence was ${direction} the results by ${Math.round(
                        Math.abs(row.meanBias) * 100,
                      )} points. `
                    : "Confidence and results were in step. "}
                  Class scored {Math.round(row.meanAccuracy * 100)}%.
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Follow-through strip — aggregate only, no names. */}
      <div className="mt-8 rounded-card border border-ink-wash bg-white p-6">
        <p className="text-[13px] uppercase tracking-[0.16em] text-secondary">
          Follow-through this window
        </p>
        <p className="mt-3 text-2xl font-medium tracking-tight text-ink-black">
          {followThrough.resolvedPct === null
            ? "No committed actions yet"
            : `${followThrough.resolvedPct}% of committed actions resolved`}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-secondary">
          <span>Improved: {followThrough.improved}</span>
          <span>Held flat: {followThrough.flat}</span>
          <span>Regressed: {followThrough.regressed}</span>
        </div>
      </div>

      <p className="mt-8 text-[13px] leading-relaxed text-secondary">
        This is a reteach signal from the class as a whole. It shows the work, not
        any child. There is nothing to enter — it took a minute.
      </p>
    </main>
  );
}
