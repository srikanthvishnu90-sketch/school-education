import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { listTeacherLessons } from "@/app/_world/teacherReflectionActions";
import { TEACHER_NAME } from "@/app/_world/teacher";
import NewLessonForm from "./NewLessonForm";
import TeacherShell from "./TeacherShell";

/**
 * Creating a lesson runs on this route (the NewLessonForm server action). With
 * photos it makes a vision analyze call (up to 15s) then a generate call (up to
 * 4s), so the function needs headroom above the ~10s default. 30s is within the
 * Hobby limit (max 60s) and safely covers the worst case, so a slow model falls
 * back to the deterministic engine instead of the platform killing the request.
 */
export const maxDuration = 30;

/**
 * The teacher's home, in the Stripe-style dashboard shell: a metric strip across
 * the top, the lesson-entry card, and the lesson list. Same information as before
 * — only the layout changed.
 */
export default async function LessonsPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") redirect("/signin");

  const lessons = await listTeacherLessons();
  const completed = lessons.reduce((n, l) => n + l.completedCount, 0);
  const started = lessons.reduce((n, l) => n + l.reflectionCount, 0);

  return (
    <TeacherShell
      teacherName={TEACHER_NAME}
      lessons={lessons.map((l) => ({ reflectionId: l.reflectionId, title: l.title }))}
    >
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-black">Home</h1>
        <span className="text-[13px] text-secondary">{TEACHER_NAME}</span>
      </div>

      {/* Metric strip — Stripe's "Gross volume / USD balance" analog, from real data. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Lessons" value={lessons.length} />
        <Stat label="Reflections completed" value={completed} />
        <Stat label="In progress" value={Math.max(0, started - completed)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* New lesson */}
        <section className="rounded-card border border-ink-wash bg-white p-5">
          <h2 className="text-[15px] font-semibold text-ink-black">
            Turn a lesson into a reflection
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">
            Tell us what happened in class. The reflection your students see is drafted
            from it, and their answers come back as one class brief.
          </p>
          <div className="mt-4">
            <NewLessonForm />
          </div>
        </section>

        {/* Lesson list */}
        <section className="rounded-card border border-ink-wash bg-white p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-secondary">
            Your lessons
          </h2>
          {lessons.length === 0 ? (
            <p className="mt-4 text-[14px] leading-relaxed text-secondary">
              No lessons yet. Create one and it appears here with how many students
              have finished.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-ink-wash">
              {lessons.map((l) => (
                <li key={l.reflectionId}>
                  <Link
                    href={`/lessons/${l.reflectionId}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-ink-tint"
                  >
                    <span className="min-w-0 truncate text-[14px] text-ink-black">
                      {l.title}
                    </span>
                    <span className="shrink-0 text-[12px] text-secondary">
                      {l.approved
                        ? `${l.completedCount} of ${l.reflectionCount} finished`
                        : "Awaiting your review"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </TeacherShell>
  );
}

function Stat({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="rounded-card border border-ink-wash bg-white px-4 py-3">
      <p className="text-[12px] text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-black">{value}</p>
    </div>
  );
}
