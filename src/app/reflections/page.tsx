import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import {
  listStudentReflections,
  type StudentReflectionStatus,
} from "@/app/_world/studentReflectionActions";
import type { LessonType } from "@/domain/intelligence";

const LESSON_TYPE_LABELS: Record<LessonType, string> = {
  direct_instruction: "Class lesson",
  discussion: "Discussion",
  group_work: "Group work",
  independent_practice: "Independent practice",
  lab: "Lab",
  presentation: "Presentation",
  project: "Project",
  review: "Review",
  assessment_prep: "Assessment prep",
  other: "Lesson",
};

const STATUS_LABELS: Record<
  StudentReflectionStatus,
  { state: string; action: string }
> = {
  not_started: { state: "Ready", action: "Start reflection" },
  active: { state: "In progress", action: "Continue" },
  completed: { state: "Completed", action: "Review reflection" },
  abandoned: { state: "Closed", action: "Unavailable" },
  escalated: { state: "Support requested", action: "Open reflection" },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

/** The student's lesson inbox: teacher-created prompts, newest first. */
export default async function ReflectionsPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const reflections = await listStudentReflections();

  return (
    <main className="mx-auto min-h-[100svh] w-full max-w-2xl px-6 py-12 sm:py-16">
      <header className="max-w-xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-ink-tint underline-offset-4 hover:underline focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-tint focus-visible:ring-offset-2 active:text-ink"
        >
          plumb
        </Link>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-ink-black">
          Your reflections
        </h1>
        <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-secondary">
          Choose a recent lesson and talk through how it went. Your teacher’s
          notes shape the questions, and you answer one at a time.
        </p>
      </header>

      {reflections.length === 0 ? (
        <section
          aria-labelledby="empty-reflections-title"
          className="mt-10 rounded-card border border-ink-wash bg-white px-6 py-8"
        >
          <h2
            id="empty-reflections-title"
            className="text-lg font-medium text-ink-black"
          >
            No reflections are ready yet
          </h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-secondary">
            When your teacher creates a reflection after class, it will appear
            here. You can come back when they let you know it’s ready.
          </p>
        </section>
      ) : (
        <section
          className="mt-10"
          aria-labelledby="available-reflections-title"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="available-reflections-title"
              className="text-base font-medium text-ink-black"
            >
              Available lessons
            </h2>
            <p className="text-sm text-secondary">
              {reflections.length}{" "}
              {reflections.length === 1 ? "lesson" : "lessons"}
            </p>
          </div>

          <ul className="mt-4 divide-y divide-ink-wash overflow-hidden rounded-card border border-ink-wash bg-white">
            {reflections.map((reflection) => {
              const status = STATUS_LABELS[reflection.status];
              const content = (
                <>
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-ink-black">
                      {reflection.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-secondary">
                      <span>{LESSON_TYPE_LABELS[reflection.lessonType]}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={reflection.createdAt}>
                        {formatDate(reflection.createdAt)}
                      </time>
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    <span className="rounded-full bg-ink-wash px-2.5 py-1 text-xs font-medium text-ink-tint">
                      {status.state}
                    </span>
                    <span className="text-sm font-medium text-ink-tint group-hover:underline group-hover:underline-offset-4">
                      {status.action}
                      {reflection.status !== "abandoned" && (
                        <span aria-hidden="true"> →</span>
                      )}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={reflection.reflectionId}>
                  {reflection.status === "abandoned" ? (
                    <div
                      className="flex min-h-24 cursor-not-allowed flex-col justify-between gap-4 px-5 py-4 opacity-65 sm:flex-row sm:items-center"
                      aria-label={`${reflection.title}. Status: ${status.state}. ${status.action}`}
                    >
                      {content}
                    </div>
                  ) : (
                    <Link
                      href={`/chat/${reflection.reflectionId}`}
                      className="group flex min-h-24 flex-col justify-between gap-4 px-5 py-4 transition-colors hover:bg-ink-wash/50 focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-tint active:bg-ink-wash motion-reduce:transition-none sm:flex-row sm:items-center"
                      aria-label={`${status.action}: ${reflection.title}. Status: ${status.state}`}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
