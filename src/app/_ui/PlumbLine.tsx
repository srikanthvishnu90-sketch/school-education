import type { ReactElement } from "react";

/**
 * The plumb line — plumb's identity mark. A hanging cord with a brass bob that
 * settles to true vertical, echoing the product's name and its purpose: finding
 * what's actually true. Decorative (aria-hidden). Use it as a quiet vertical
 * accent beside a hero or section heading, not as a loud graphic.
 *
 * `height` sets the cord length in px. `drop` plays the one-time settle animation
 * (respects prefers-reduced-motion via the `.plumb-bob-drop` utility).
 */
export default function PlumbLine({
  height = 72,
  drop = false,
  className = "",
}: {
  height?: number;
  drop?: boolean;
  className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden
      className={`inline-flex flex-col items-center ${drop ? "plumb-bob-drop" : ""} ${className}`}
      style={{ height }}
    >
      {/* cord */}
      <span className="w-px flex-1 bg-current opacity-40" />
      {/* brass bob — a small plumb weight */}
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="shrink-0">
        <path
          d="M5 0.5 L9 4 L5 13.5 L1 4 Z"
          fill="var(--color-shell-accent, #8FBC9F)"
        />
      </svg>
    </span>
  );
}
