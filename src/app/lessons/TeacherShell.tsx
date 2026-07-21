"use client";

import { FileText, Home, LogOut, Menu, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import Wordmark from "@/app/_ui/Wordmark";
import { signOutAction } from "@/app/_world/session";

/**
 * The teacher dashboard shell — a Stripe-style layout (left nav rail + top bar +
 * a wide content area), rendered in plumb's light ink palette. It only reshapes
 * the frame; the teacher's actual content (lesson entry, lists, briefs, scores)
 * is passed in as children and unchanged.
 */

export interface ShellLesson {
  reflectionId: string;
  title: string;
}

export default function TeacherShell({
  teacherName,
  lessons,
  activeId,
  children,
}: {
  teacherName: string;
  lessons: ShellLesson[];
  /** The reflectionId currently open (highlights its nav row), if any. */
  activeId?: string;
  children: ReactNode;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const initials = teacherName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? lessons : lessons.filter((l) => l.title.toLowerCase().includes(q));
  }, [lessons, query]);

  return (
    <div className="flex min-h-[100svh] bg-paper text-ink-black">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-ink-black/30 md:hidden"
        />
      )}

      {/* Left rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-ink-wash bg-white transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand lockup — the product mark; the teacher's own identity lives in
            the rail footer, so this stays purely the plumb wordmark. */}
        <div className="flex items-center justify-between px-3 py-3">
          <div className="px-2 py-1.5">
            <Wordmark
              size="nav"
              tone="light"
              href="/lessons"
              className="text-ink-black hover:text-ink-tint"
            />
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-secondary hover:bg-paper md:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="px-2">
          <NavItem href="/lessons" icon={<Home size={17} />} active={activeId === undefined}>
            Home
          </NavItem>
          <NavItem href="/roster" icon={<Users size={17} />}>
            Class roster
          </NavItem>
        </nav>

        {lessons.length > 0 && (
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">
              Lessons
            </p>
            {filtered.length === 0 ? (
              <p className="px-3 py-1.5 text-[13px] text-secondary">
                No lessons match “{query.trim()}”.
              </p>
            ) : (
              filtered.map((l) => (
                <NavItem
                  key={l.reflectionId}
                  href={`/lessons/${l.reflectionId}`}
                  icon={<FileText size={16} />}
                  active={l.reflectionId === activeId}
                >
                  {l.title}
                </NavItem>
              ))
            )}
          </div>
        )}

        {/* Footer identity + sign out */}
        <div className="mt-auto flex items-center gap-2 border-t border-ink-wash px-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-wash text-[11px] font-medium text-ink">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink-black">{teacherName}</p>
            <p className="text-[11px] text-secondary">Teacher</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-secondary transition-colors hover:bg-paper hover:text-ink-black"
            >
              <LogOut size={16} aria-hidden />
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-ink-wash bg-white px-4 py-2.5">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-secondary hover:bg-paper md:hidden"
          >
            <Menu size={18} />
          </button>
          <label className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-control border border-ink-wash bg-paper px-3 focus-within:border-ink-tint">
            <Search size={15} className="shrink-0 text-secondary" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your lessons"
              aria-label="Search your lessons"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink-black outline-none placeholder:text-secondary"
            />
          </label>
        </header>

        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  active = false,
  children,
}: {
  href: string;
  icon: ReactNode;
  active?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-control px-3 py-1.5 text-[13.5px] transition-colors ${
        active
          ? "bg-ink-wash font-medium text-ink"
          : "text-secondary hover:bg-paper hover:text-ink-black"
      }`}
    >
      <span className={active ? "text-ink-tint" : "text-secondary"}>{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
