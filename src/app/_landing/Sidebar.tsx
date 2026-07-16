"use client";

import { LogOut, PanelLeft, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import type { ReactElement } from "react";
import { signOutAction } from "@/app/_world/session";

/**
 * The left rail on the signed-out landing. It carries no fake navigation — every
 * real destination lives behind sign-in — so instead it states, plainly, the
 * three things that make plumb trustworthy to a school. Under 768px it lifts out
 * into an overlay drawer driven by the hamburger in the header.
 */

const PROMISES = [
  { label: "Task-focused, never a verdict about the student", Icon: UserRound },
  { label: "Private by default; safety alerts go to a real adult", Icon: ShieldCheck },
  { label: "AI drafts and classifies; people own every decision", Icon: Sparkles },
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

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="px-0.5 pb-2 text-[12px] font-medium text-shell-text">
            What plumb promises
          </p>
          <ul className="flex flex-col gap-3">
            {PROMISES.map(({ label, Icon }) => (
              <li key={label} className="flex items-start gap-2.5 text-[13px] text-shell-muted">
                <Icon size={15} aria-hidden className="mt-0.5 shrink-0" />
                <span className="leading-relaxed">{label}</span>
              </li>
            ))}
          </ul>
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
                className="rounded-lg p-1.5 text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
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
