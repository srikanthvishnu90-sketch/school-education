"use client";

import { ArrowLeft, Menu, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import HeroInput from "@/app/_landing/HeroInput";
import Sidebar from "@/app/_landing/Sidebar";
import type { CourseReflection } from "@/app/_world/courseActions";
import type { Course } from "@/app/_world/courses";

/**
 * One course, on the same shell as the landing: a greeting, the composer, and
 * the class's reflections as the actionable rows. The composer is a stub here —
 * a reflection is a guided conversation the teacher's lesson seeds, so it starts
 * from a row, not from free text.
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
}: {
  course: Course;
  reflections: CourseReflection[];
  studentName: string;
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

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10">
          <div className="w-full max-w-xl">
            <h1 className="text-center text-[22px] font-normal tracking-tight sm:text-[28px]">
              {course.name}
            </h1>
            <p className="mt-2 text-center text-[13px] text-shell-muted">
              {course.code} · {course.teacher}
            </p>

            <div className="mt-6">
              <HeroInput placeholder={`Ask about ${course.name}`} />
            </div>

            {reflections.length === 0 ? (
              <p className="mt-6 text-center text-[14px] text-shell-muted">
                Nothing to reflect on yet. When {course.teacher} posts a lesson,
                it shows up here.
              </p>
            ) : (
              <ul className="mt-4 flex w-full flex-col">
                {reflections.map((r) => (
                  <li key={r.reflectionId}>
                    <Link
                      href={`/chat/${r.reflectionId}`}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white/5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-shell-muted">
                        <MessageSquareText size={16} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-shell-text">
                        {r.title}
                      </span>
                      <span className="shrink-0 text-[12px] text-shell-muted">
                        {STATUS_LABEL[r.status] ?? "Open"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
