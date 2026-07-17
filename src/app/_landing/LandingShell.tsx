"use client";

import { Menu } from "lucide-react";
import { useState, type ReactElement } from "react";
import SiteFooter from "@/app/_legal/SiteFooter";
import HeroInput from "./HeroInput";
import LoginButton from "./LoginButton";
import QuickActions from "./QuickActions";
import RoleToggle, { type Role } from "./RoleToggle";
import Sidebar from "./Sidebar";

/**
 * The signed-out entry surface. Two decisions live here and nowhere else: which
 * side you're on (the toggle) and walking through the door (the Login pill) —
 * the pill is the only white thing on the page, so nothing competes with it.
 *
 * `greeting` is a prop so it can be personalized once there's a session.
 */
export default function LandingShell({
  initialRole = "teacher",
}: {
  initialRole?: Role;
}): ReactElement {
  const [role, setRole] = useState<Role>(initialRole);
  const [menuOpen, setMenuOpen] = useState(false);

  const headline =
    role === "teacher" ? "Read the class back." : "See how the lesson really went.";
  const subline =
    role === "teacher"
      ? "Turn a lesson into an honest, task-focused brief. No ranking, no diagnosis, no surveillance."
      : "Talk through a lesson one question at a time, and leave with one next step you choose.";

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

          {/* Centered on desktop; flows inline on narrow screens. */}
          <div className="md:absolute md:left-1/2 md:top-3 md:-translate-x-1/2">
            <RoleToggle role={role} onChange={setRole} />
          </div>

          <LoginButton role={role} />
        </header>

        <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10">
          <div className="w-full max-w-xl">
            <h1 className="text-center text-[24px] font-normal tracking-tight text-shell-text sm:text-[30px]">
              {headline}
            </h1>
            <p className="mt-3 text-center text-[14px] leading-relaxed text-shell-muted">
              {subline}
            </p>
            <div className="mt-6">
              <HeroInput />
            </div>
            <QuickActions role={role} />
          </div>
        </main>

        <SiteFooter tone="dark" />
      </div>
    </div>
  );
}
