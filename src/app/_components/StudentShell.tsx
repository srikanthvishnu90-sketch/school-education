"use client";

import { Menu } from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";
import Sidebar from "@/app/_landing/Sidebar";

/**
 * The signed-in student's app shell: the dark left rail (Sidebar) plus a scrolling
 * content column with a mobile hamburger. The same frame CoursesShell renders, lifted
 * out so any student surface (courses, reflections) sits on ONE consistent shell
 * instead of a stray light page — no jarring shell-to-orphan jumps.
 */
export default function StudentShell({
  studentName,
  headerLabel,
  children,
}: {
  studentName: string;
  /** The muted label in the top bar, e.g. "Reflections". */
  headerLabel: string;
  children: ReactNode;
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
          <span className="text-[13px] text-shell-muted">{headerLabel}</span>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-12"
        >
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
