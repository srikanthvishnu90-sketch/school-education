"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import LoginButton from "./LoginButton";
import QuickActions from "./QuickActions";
import RoleToggle, { type Role } from "./RoleToggle";
import Sidebar from "./Sidebar";

/**
 * The signed-out entry surface. Its whole job is to say, in five seconds, what
 * plumb is and give one clear way in. Two choices live here: which side you're on
 * (the toggle) and walking through the door (Get started / Login). Everything on
 * the page is real — no dead controls a visitor can click into nothing.
 */
export default function LandingShell({
  initialRole = "teacher",
}: {
  initialRole?: Role;
}): ReactElement {
  const [role, setRole] = useState<Role>(initialRole);
  const [menuOpen, setMenuOpen] = useState(false);

  const headline =
    role === "teacher"
      ? "Read the class back."
      : "See how the lesson really went.";
  const subline =
    role === "teacher"
      ? "Add today's lesson and plumb turns your class's reflections into one honest, task-focused brief — what landed, what didn't, and where to go next. No ranking, no diagnosis, no surveillance."
      : "Talk through today's lesson one question at a time, then leave with one small next step you choose. Your answers are private and never change your grade.";

  return (
    <div className="flex h-[100svh] overflow-hidden bg-shell-background text-shell-text">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-shell-muted hover:bg-white/5 hover:text-shell-text md:invisible"
          >
            <Menu size={20} />
          </button>

          <div className="md:absolute md:left-1/2 md:top-3 md:-translate-x-1/2">
            <RoleToggle role={role} onChange={setRole} />
          </div>

          <LoginButton role={role} />
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-12">
          <div className="w-full max-w-xl">
            <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-shell-muted">
              plumb · classroom reflection
            </p>
            <h1 className="mt-3 text-[30px] font-normal leading-tight tracking-tight text-shell-text sm:text-[38px]">
              {headline}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-shell-muted">
              {subline}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={`/signin?role=${role}`}
                className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[14px] font-medium text-shell-background transition-opacity hover:opacity-90"
              >
                {role === "teacher" ? "Get started as a teacher" : "Start reflecting"}
              </Link>
              <Link
                href="/signin"
                className="inline-flex min-h-11 items-center rounded-full px-3 text-[14px] text-shell-muted transition-colors hover:text-shell-text"
              >
                Sign in with your school email →
              </Link>
            </div>

            <QuickActions role={role} />
          </div>
        </main>
      </div>
    </div>
  );
}
