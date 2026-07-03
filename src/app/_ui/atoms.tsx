import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

/**
 * Calm, presentational building blocks for the student cycle. Paper canvas, ink
 * text, one thing at a time. No color ever encodes accuracy as green/red — the
 * only state tints are ink-tint (aligned) and warm (gap).
 */

/** A single-question screen: centered, unhurried, one decision. */
export function Stage({
  eyebrow,
  question,
  children,
  footer,
  voice = false,
}: {
  eyebrow?: string;
  question?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Reflection surfaces use the serif "voice" font. */
  voice?: boolean;
}): ReactElement {
  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-xl flex-col px-6 py-10">
      <div className="flex flex-1 flex-col justify-center">
        {eyebrow !== undefined && (
          <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
            {eyebrow}
          </p>
        )}
        {question !== undefined && (
          <h1
            className={`text-2xl leading-snug tracking-tight text-ink-black sm:text-3xl ${
              voice ? "font-normal [font-family:var(--font-voice)]" : "font-medium"
            }`}
          >
            {question}
          </h1>
        )}
        {children !== undefined && <div className="mt-8">{children}</div>}
      </div>
      {footer !== undefined && <div className="pt-8">{footer}</div>}
    </main>
  );
}

/** Quiet progress — dots, never a percentage or a race. */
export function Dots({
  total,
  index,
}: {
  total: number;
  index: number;
}): ReactElement {
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={index + 1}
      aria-label="Progress"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            i === index ? "bg-ink-tint" : "bg-ink-wash"
          }`}
        />
      ))}
    </div>
  );
}

/** A low-emphasis link — the persistent way out, so nothing ever traps the student. */
export function QuietLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Link
      href={href}
      className="text-sm text-secondary underline-offset-4 transition-colors hover:text-ink-tint hover:underline"
    >
      {children}
    </Link>
  );
}

/** The primary continue affordance — one per screen. */
export function Primary({
  onClick,
  href,
  children,
  disabled = false,
  type = "button",
}: {
  onClick?: () => void;
  href?: string;
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}): ReactElement {
  const cls =
    "inline-flex items-center justify-center rounded-control bg-ink px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40";
  if (href !== undefined) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
