"use client";

import {
  BookOpen,
  Clock,
  LogOut,
  MessageSquareText,
  PanelLeft,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";
import Wordmark from "@/app/_ui/Wordmark";
import { signOutAction } from "@/app/_world/session";

/**
 * The left rail. Two states, one component. Signed OUT (the landing): no fake
 * navigation — every real destination lives behind sign-in — so it states plainly
 * the three things that make plumb trustworthy to a school. Signed IN (a student's
 * courses / a class): real navigation to the surfaces they own. Under 768px it
 * lifts out into an overlay drawer driven by the hamburger in the header.
 */

const PROMISES = [
  { label: "Task-focused, never a verdict about the student", Icon: UserRound },
  { label: "Private by default; safety alerts go to a real adult", Icon: ShieldCheck },
  { label: "AI drafts and classifies; people own every decision", Icon: Sparkles },
] as const;

const NAV = [
  { label: "My courses", href: "/courses", Icon: BookOpen },
  { label: "Reflections", href: "/reflections", Icon: MessageSquareText },
  { label: "Timeline", href: "/timeline", Icon: Clock },
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
          <Wordmark size="sm" tone="dark" href="/" className="text-shell-text" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
          >
            <X size={16} />
          </button>
          <PanelLeft
            size={16}
            aria-hidden
            className="hidden text-shell-muted md:block"
          />
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3">
          {user !== undefined ? (
            <nav className="flex flex-col gap-0.5" onClick={onClose}>
              {NAV.map(({ label, href, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </Link>
              ))}
            </nav>
          ) : (
            <>
              <p className="px-0.5 pb-2 pt-2 text-[12px] font-medium text-shell-text">
                What plumb promises
              </p>
              <ul className="flex flex-col gap-3">
                {PROMISES.map(({ label, Icon }) => (
                  <li
                    key={label}
                    className="flex items-start gap-2.5 text-[13px] text-shell-muted"
                  >
                    <Icon size={15} aria-hidden className="mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {user !== undefined && (
          <div className="flex items-center gap-2.5 border-t border-white/5 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-shell-panel text-[11px] font-medium text-shell-text">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-shell-text">{user.name}</p>
              <p className="text-[11px] text-shell-muted">{user.plan}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
              >
                <LogOut size={16} aria-hidden />
              </button>
            </form>
          </div>
        )}
      </aside>
    </>
  );
}
