"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import Sidebar from "@/app/_landing/Sidebar";
import type { CourseCard } from "@/app/_world/courseActions";

/**
 * The student's course grid — the D2L shape (a card per class), rendered on the
 * app's dark shell. Each card leads into that course's reflection space.
 */
export default function CoursesShell({
  courses,
  greeting,
}: {
  courses: CourseCard[];
  greeting: string;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-[100svh] overflow-hidden bg-shell-background text-shell-text">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

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
          <span className="text-[13px] text-shell-muted">My courses</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-12">
          <div className="mx-auto max-w-4xl">
            <h1 className="mt-4 text-[22px] font-normal tracking-tight sm:text-[28px]">
              {greeting}
            </h1>
            <p className="mt-2 text-[14px] text-shell-muted">
              Pick a class to reflect on what happened today.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/courses/${c.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-shell-border bg-shell-sidebar transition-colors hover:border-white/25"
                  >
                    {/* Monogram banner stands in for D2L's course image. */}
                    <span
                      aria-hidden
                      className="flex h-20 items-center justify-center bg-shell-panel text-[22px] font-semibold tracking-widest text-shell-muted transition-colors group-hover:text-shell-text"
                    >
                      {c.monogram}
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-4">
                      <span className="text-[15px] font-medium text-shell-text">
                        {c.name}
                      </span>
                      <span className="text-[12px] text-shell-muted">{c.code}</span>
                      <span className="text-[12px] text-shell-muted">
                        {c.teacher}
                      </span>
                      <span className="mt-3 text-[12px] text-shell-muted">
                        {c.total === 0
                          ? "No reflections yet"
                          : c.open > 0
                            ? `${c.open} to do · ${c.total} total`
                            : `All ${c.total} done`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
