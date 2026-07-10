import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { listTeacherLessons } from "@/app/_world/teacherReflectionActions";
import NewLessonForm from "./NewLessonForm";

/**
 * The teacher's reflection home: enter a new lesson, and see every lesson the
 * class has reflected on with how many students have finished. Instructional
 * signal only — the brief lives one click in, never a roster of individuals here.
 */
export default async function LessonsPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") redirect("/signin");

  const lessons = await listTeacherLessons();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        Reflections
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
        Turn a lesson into a reflection
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-secondary">
        Tell us what happened in class. The reflection your students see is drafted
        from it, and their answers come back to you as one class brief.
      </p>

      <div className="mt-8">
        <NewLessonForm />
      </div>

      {lessons.length > 0 ? (
        <div className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
            Your lessons
          </h2>
          <ul className="mt-4 flex flex-col gap-2">
            {lessons.map((l) => (
              <li key={l.reflectionId}>
                <Link
                  href={`/lessons/${l.reflectionId}`}
                  className="flex items-center justify-between rounded-card border border-ink-wash bg-white px-4 py-3 transition-colors hover:border-ink-tint"
                >
                  <span className="text-[15px] text-ink-black">{l.title}</span>
                  <span className="text-[13px] text-secondary">
                    {l.completedCount} of {l.reflectionCount} finished
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
