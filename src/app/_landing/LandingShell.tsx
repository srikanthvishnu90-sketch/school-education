"use client";

import { Menu } from "lucide-react";
import { useState, type ReactElement } from "react";
import SiteFooter from "@/app/_legal/SiteFooter";
import PlumbLine from "@/app/_ui/PlumbLine";
import Wordmark from "@/app/_ui/Wordmark";
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

  const eyebrow =
    role === "teacher" ? "Classroom reflection" : "Before the test";
  const headline =
    role === "teacher"
      ? "Read the class back."
      : "You think you get it. Does the test agree?";
  const subline =
    role === "teacher"
      ? "Every student talks through what they understood and picks one next step — then you read the class back as one honest brief, including where their confidence matched the work and where it didn't. No ranking, no diagnosis, no surveillance."
      : "A few minutes after class: try it from memory, see what actually stuck, and leave with one thing to do. It never changes your grade — your teacher only sees how the class did.";

  return (
    <div className="flex h-[100svh] overflow-hidden bg-shell-background text-shell-text">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
            >
              <Menu size={20} />
            </button>
            <Wordmark
              size="nav"
              tone="dark"
              href="/"
              className="hidden text-shell-text sm:inline-flex"
            />
          </div>

          {/* Centered on desktop; flows inline on narrow screens. */}
          <div className="md:absolute md:left-1/2 md:top-3 md:-translate-x-1/2">
            <RoleToggle role={role} onChange={setRole} />
          </div>

          <LoginButton role={role} />
        </header>

        <main id="main-content" tabIndex={-1} className="graph-paper-dark flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10">
          <div className="flex w-full max-w-xl flex-col items-center">
            {/* Signature motif: the plumb line swings and settles to true. */}
            <PlumbLine
              height={72}
              className="text-shell-muted plumb-line-settle"
            />
            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.22em] text-shell-muted">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-balance text-center font-voice text-[30px] font-normal leading-[1.08] tracking-tight text-shell-text sm:text-[42px]">
              {headline}
            </h1>
            <p className="mt-4 max-w-md text-center text-[15px] leading-relaxed text-shell-muted">
              {subline}
            </p>
            <div className="mt-9 w-full">
              <HeroInput role={role} />
            </div>
            <QuickActions role={role} />
          </div>
        </main>

        <SiteFooter tone="dark" />
      </div>
    </div>
  );
}
