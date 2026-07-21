"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import Sidebar from "@/app/_landing/Sidebar";
import PlumbLine from "@/app/_ui/PlumbLine";
import type { CourseCard } from "@/app/_world/courseActions";
import type { Subject } from "@/app/_world/courses";

/**
 * Subject colours, resolved to STATIC class strings (Tailwind can't build class
 * names from runtime values). Each subject touches only a small tag + the card's
 * left border — never a full fill — so the surface stays calm.
 */
const SUBJECT: Record<Subject, { label: string; border: string; text: string; dot: string }> = {
  math: { label: "Math", border: "border-l-subject-math", text: "text-subject-math", dot: "bg-subject-math" },
  english: { label: "English", border: "border-l-subject-english", text: "text-subject-english", dot: "bg-subject-english" },
  science: { label: "Science", border: "border-l-subject-science", text: "text-subject-science", dot: "bg-subject-science" },
  history: { label: "History", border: "border-l-subject-history", text: "text-subject-history", dot: "bg-subject-history" },
  spanish: { label: "Spanish", border: "border-l-subject-spanish", text: "text-subject-spanish", dot: "bg-subject-spanish" },
};

/**
 * The student's course grid — the D2L shape (a card per class), rendered on the
 * app's dark shell. Each card leads into that course's reflection space.
 */
export default function CoursesShell({
  courses,
  greeting,
  studentName,
}: {
  courses: CourseCard[];
  greeting: string;
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
        <header className="graph-paper-dark flex shrink-0 items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
          >
            <Menu size={18} />
          </button>
          <span className="text-[13px] text-shell-muted">My courses</span>
        </header>

        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto px-5 pb-12">
          <div className="mx-auto max-w-4xl">
            <div className="mt-8 flex items-start gap-3.5">
              <PlumbLine height={46} className="hidden text-shell-accent sm:flex" />
              <div className="min-w-0">
                <h1 className="font-voice text-[24px] font-normal leading-tight tracking-tight text-shell-text sm:text-[30px]">
                  {greeting}
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-shell-muted">
                  Pick a class to reflect on what happened today.
                </p>
              </div>
            </div>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => {
                const s = SUBJECT[c.subject];
                return (
                  <li key={c.id}>
                    <Link
                      href={`/courses/${c.id}`}
                      className={`group flex h-full flex-col overflow-hidden rounded-xl border border-shell-border border-l-2 ${s.border} bg-shell-card transition-colors hover:border-shell-accent/40 hover:bg-shell-panel/30`}
                    >
                      {/* Monogram banner stands in for D2L's course image — set on
                         the plumb graph-paper grid so every card carries the motif. */}
                      <span
                        aria-hidden
                        className="graph-paper-dark flex h-20 items-center justify-center border-b border-shell-border bg-shell-panel text-[22px] font-semibold tracking-widest text-shell-muted transition-colors group-hover:text-shell-text"
                      >
                        {c.monogram}
                      </span>
                      <span className="flex flex-1 flex-col gap-1 p-4">
                        <span
                          className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide ${s.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
                          {s.label}
                        </span>
                        <span className="mt-1 text-[15px] font-medium text-shell-text">
                          {c.name}
                        </span>
                        <span className="text-[12px] text-shell-muted">{c.code}</span>
                        <span className="text-[12px] text-shell-muted">
                          {c.teacher}
                        </span>
                        <span className="mt-auto pt-3 text-[12px] text-shell-muted">
                          <span className="block border-t border-shell-border/60 pt-3">
                            {c.total === 0
                              ? "No reflections yet"
                              : c.open > 0
                                ? `${c.open} to do · ${c.total} total`
                                : `All ${c.total} done`}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
