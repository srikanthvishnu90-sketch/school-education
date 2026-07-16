"use client";

import { ArrowLeft, Menu, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import Sidebar from "@/app/_landing/Sidebar";
import type { AssistantMessage } from "@/app/_world/assistant";
import type { CourseReflection } from "@/app/_world/courseActions";
import type { Course } from "@/app/_world/courses";
import CourseChat from "./CourseChat";

/**
 * One course. Two things live here, exactly as a student expects after clicking a
 * class: the day's REFLECTION (the guided conversation the teacher's lesson seeds)
 * and an open CHAT to think the class through freely. The reflection is structured
 * and scored-adjacent; the chat is private, task-focused, and reward-free.
 */

const STATUS_LABEL: Record<string, string> = {
  not_started: "Start reflection",
  active: "Continue",
  completed: "Review",
  escalated: "Open",
  abandoned: "Closed",
};

export default function CourseShell({
  course,
  reflections,
  studentName,
  chatHistory,
}: {
  course: Course;
  reflections: CourseReflection[];
  studentName: string;
  chatHistory: AssistantMessage[];
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = studentName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-[100svh] overflow-hidden bg-shell-background text-shell-text">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={{ name: studentName, plan: "Student", initials }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
          >
            <Menu size={18} />
          </button>
          <Link
            href="/courses"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-shell-muted hover:text-shell-text"
          >
            <ArrowLeft size={14} aria-hidden />
            My courses
          </Link>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-4 pb-2">
          <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-col pt-1">
            <h1 className="text-[22px] font-normal tracking-tight sm:text-[26px]">
              {course.name}
            </h1>
            <p className="mt-1 text-[13px] text-shell-muted">
              {course.code} · {course.teacher}
            </p>

            {/* The day's reflection(s) — the structured, teacher-seeded conversation. */}
            <div className="mt-4 rounded-xl border border-shell-border bg-shell-card p-1.5">
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-shell-muted">
                Today&rsquo;s reflection
              </p>
              {reflections.length === 0 ? (
                <p className="px-2.5 pb-2 pt-0.5 text-[13px] text-shell-muted">
                  Nothing to reflect on yet. When {course.teacher} posts a lesson, it
                  shows up here.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {reflections.map((r) => (
                    <li key={r.reflectionId}>
                      <Link
                        href={`/chat/${r.reflectionId}`}
                        className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-shell-muted">
                          <MessageSquareText size={15} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] text-shell-text">
                          {r.title}
                        </span>
                        <span className="shrink-0 text-[12px] text-shell-sage">
                          {STATUS_LABEL[r.status] ?? "Open"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* The open study chat fills the rest of the height. */}
          <CourseChat
            courseId={course.id}
            courseName={course.name}
            studentName={studentName}
            initial={chatHistory}
          />
        </main>
      </div>
    </div>
  );
}
