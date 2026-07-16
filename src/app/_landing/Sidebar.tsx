"use client";

import {
  Blocks,
  BookOpen,
  GraduationCap,
  LogOut,
  PanelLeft,
  SquarePen,
  X,
} from "lucide-react";
import type { ReactElement } from "react";
import { signOutAction } from "@/app/_world/session";

/**
 * The left rail: start a chat, or jump to a grade band. K–12 splits three ways
 * because the bands ask genuinely different things of a reflection — a 2nd
 * grader and a junior don't get the same question. Decorative for now (href="#")
 * until the signed-in surfaces own it. Under 768px it lifts out into an overlay
 * drawer driven by the hamburger in the header.
 */

const NAV = [
  { label: "New chat", Icon: SquarePen },
  { label: "K–5", Icon: Blocks },
  { label: "6–8", Icon: BookOpen },
  { label: "9–12", Icon: GraduationCap },
] as const;

const RECENTS = [
  "Factoring quadratics — period 3",
  "Slope from a table",
  "Unit 2 review day",
  "Lab: motion graphs",
  "Exit ticket — Friday",
] as const;

export default function Sidebar({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  /** When signed in, the footer shows this identity + a working Sign out. */
  user?: { name: string; plan: string; initials: string };
}): ReactElement {
  return (
    <>
      {/* Scrim — only on mobile, only when open. */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col bg-shell-sidebar transition-transform duration-200 ease-out motion-reduce:transition-none md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-[14px] font-semibold tracking-tight text-shell-text">
            plumb
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1 text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
          >
            <X size={16} />
          </button>
          <PanelLeft
            size={16}
            aria-hidden
            className="hidden text-shell-muted md:block"
          />
        </div>

        <nav className="px-2">
          {NAV.map(({ label, Icon }) => (
            <a
              key={label}
              href="#"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
            >
              <Icon size={16} aria-hidden />
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
          <p className="px-2.5 pb-1.5 text-[12px] font-medium text-shell-text">
            Recents
          </p>
          {RECENTS.map((title) => (
            <a
              key={title}
              href="#"
              className="block truncate rounded-lg px-2.5 py-1.5 text-[13px] text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
            >
              {title}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2.5 border-t border-white/5 px-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-shell-panel text-[11px] font-medium text-shell-text">
            {user?.initials ?? "VS"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-shell-text">
              {user?.name ?? "Vishnu Srikanth"}
            </p>
            <p className="text-[11px] text-shell-muted">{user?.plan ?? "Pro"}</p>
          </div>
          {user !== undefined && (
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                className="rounded-lg p-1.5 text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
              >
                <LogOut size={16} aria-hidden />
              </button>
            </form>
          )}
        </div>
      </aside>
    </>
  );
}
