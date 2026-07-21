"use client";

import { useRef, type KeyboardEvent, type ReactElement } from "react";

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
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % ROLES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + ROLES.length) % ROLES.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = ROLES.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    onChange(ROLES[next]);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Choose your role"
      className="relative flex h-9 w-[220px] shrink-0 items-center rounded-full bg-shell-track p-1 sm:h-10 sm:w-[240px]"
    >
      {/* The sliding pill. Sized to half the track, moved by translate. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-shell-sage transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {ROLES.map((r, i) => {
        const active = r === role;
        return (
          <button
            key={r}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(r)}
            onKeyDown={handleKeyDown}
            className={`relative z-10 flex-1 rounded-full text-[15px] font-medium transition-colors sm:text-[16px] ${
              active
                ? "text-shell-background"
                : "text-shell-muted hover:text-shell-text"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-sage/50`}
          >
            {LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}
