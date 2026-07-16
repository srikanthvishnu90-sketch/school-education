"use client";

import type { ReactElement } from "react";

/**
 * The Teacher / Student segmented control. Sized just a touch above the
 * reference's Chat/Work toggle — enough that the entry decision reads first,
 * without shouting. The active pill is ONE element translated with a transform
 * transition, so it physically slides rather than re-rendering in place.
 */

export type Role = "teacher" | "student";

export const ROLES: readonly Role[] = ["teacher", "student"];

const LABELS: Record<Role, string> = {
  teacher: "Teacher",
  student: "Student",
};

export default function RoleToggle({
  role,
  onChange,
}: {
  role: Role;
  onChange: (role: Role) => void;
}): ReactElement {
  const index = ROLES.indexOf(role);

  return (
    <div
      role="tablist"
      aria-label="Choose your role"
      className="relative flex h-9 w-[220px] shrink-0 items-center rounded-full bg-shell-track p-1 sm:h-10 sm:w-[240px]"
    >
      {/* The sliding pill. Sized to half the track, moved by translate. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-shell-active transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {ROLES.map((r) => {
        const active = r === role;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r)}
            className={`relative z-10 flex-1 rounded-full text-[15px] font-medium transition-colors sm:text-[16px] ${
              active ? "text-shell-text" : "text-shell-muted hover:text-shell-text"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
          >
            {LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}
