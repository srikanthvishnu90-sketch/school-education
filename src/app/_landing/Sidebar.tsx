"use client";

import {
  Clock,
  FolderClosed,
  Library,
  MoreHorizontal,
  PanelLeft,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import type { ReactElement } from "react";

/**
 * The left rail. Decorative for now — every destination is stubbed (href="#")
 * until the signed-in surfaces own it. Under 768px it lifts out into an overlay
 * drawer driven by the hamburger in the header.
 */

const NAV = [
  { label: "New chat", Icon: SquarePen },
  { label: "Search", Icon: Search },
  { label: "Library", Icon: Library },
  { label: "Projects", Icon: FolderClosed },
  { label: "Scheduled", Icon: Clock },
  { label: "More", Icon: MoreHorizontal },
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
}: {
  open: boolean;
  onClose: () => void;
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-shell-sidebar transition-transform duration-200 ease-out motion-reduce:transition-none md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-[17px] font-semibold tracking-tight text-shell-text">
            plumb
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
          >
            <X size={18} />
          </button>
          <PanelLeft
            size={18}
            aria-hidden
            className="hidden text-shell-muted md:block"
          />
        </div>

        <nav className="px-2">
          {NAV.map(({ label, Icon }) => (
            <a
              key={label}
              href="#"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
            >
              <Icon size={18} aria-hidden />
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2">
          <p className="px-3 pb-2 text-[13px] font-medium text-shell-text">
            Recents
          </p>
          {RECENTS.map((title) => (
            <a
              key={title}
              href="#"
              className="block truncate rounded-xl px-3 py-2 text-[14px] text-shell-muted transition-colors hover:bg-white/5 hover:text-shell-text"
            >
              {title}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shell-panel text-[12px] font-medium text-shell-text">
            VS
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] text-shell-text">Vishnu Srikanth</p>
            <p className="text-[12px] text-shell-muted">Pro</p>
          </div>
        </div>
      </aside>
    </>
  );
}
