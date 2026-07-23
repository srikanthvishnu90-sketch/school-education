import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { studentDisplayName } from "@/app/_world/teacher";
import StudentShell from "@/app/_components/StudentShell";
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
  not_started: { state: "Ready", action: "Start" },
  active: { state: "In progress", action: "Continue" },
  completed: { state: "Completed", action: "Review" },
  abandoned: { state: "Closed", action: "Unavailable" },
  escalated: { state: "Support requested", action: "Open" },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

/**
 * The student's lesson inbox — every teacher-created reflection across all their
 * courses, newest first. A flat cross-course view that complements the per-course
 * drill-down under /courses, rendered on the same dark app shell.
 */
export default async function ReflectionsPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const reflections = await listStudentReflections();
  const name = studentDisplayName(user.id);

  return (
    <StudentShell studentName={name} headerLabel="Lessons">
      <header className="max-w-xl">
        <h1 className="mt-4 text-[22px] font-normal tracking-tight sm:text-[28px]">
          Your lessons
        </h1>
        <p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-shell-muted">
          Pick a recent lesson and go through how it went. Your teacher&rsquo;s
          notes shape the questions, and you answer one at a time.
        </p>
      </header>

      {reflections.length === 0 ? (
        <section
          aria-labelledby="empty-reflections-title"
          className="mt-8 rounded-xl border border-shell-border bg-shell-card px-6 py-8"
        >
          <h2
            id="empty-reflections-title"
            className="text-[15px] font-medium text-shell-text"
          >
            No lessons are ready yet
          </h2>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-shell-muted">
            When your teacher posts a lesson after class, it will appear
            here. You can come back when they let you know it&rsquo;s ready.
          </p>
        </section>
      ) : (
        <section className="mt-8" aria-labelledby="available-reflections-title">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="available-reflections-title"
              className="text-[15px] font-medium text-shell-text"
            >
              Available lessons
            </h2>
            <p className="text-[13px] text-shell-muted">
              {reflections.length}{" "}
              {reflections.length === 1 ? "lesson" : "lessons"}
            </p>
          </div>

          <ul className="mt-4 divide-y divide-shell-border overflow-hidden rounded-xl border border-shell-border bg-shell-card">
            {reflections.map((reflection) => {
              const status = STATUS_LABELS[reflection.status];
              const content = (
                <>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-shell-text">
                      {reflection.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-shell-muted">
                      <span>{LESSON_TYPE_LABELS[reflection.lessonType]}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={reflection.createdAt}>
                        {formatDate(reflection.createdAt)}
                      </time>
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    <span className="rounded-full bg-shell-panel px-2.5 py-1 text-xs font-medium text-shell-muted">
                      {status.state}
                    </span>
                    <span className="text-[13px] font-medium text-shell-accent group-hover:underline group-hover:underline-offset-4">
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
                      className="group flex min-h-24 flex-col justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/5 focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-shell-accent active:bg-white/10 motion-reduce:transition-none sm:flex-row sm:items-center"
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
    </StudentShell>
  );
}
