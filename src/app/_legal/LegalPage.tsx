import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import SiteFooter from "./SiteFooter";

/**
 * A shared wrapper for the public trust pages (Privacy, Terms, Help, Contact).
 * Light, readable long-form on plumb's paper surface, a consistent header with a
 * way back home, and the site footer.
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** e.g. "Last updated July 2026" — omitted for Help/Contact. */
  updated?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink-black">
      <header className="graph-paper border-b border-ink-wash bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/"
            className="text-[14px] font-semibold tracking-[0.02em] text-ink-black hover:text-ink-tint"
          >
            plumb
          </Link>
          <Link
            href="/signin"
            className="text-[13px] text-ink-tint underline-offset-4 hover:underline"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 px-6 py-12">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-voice text-3xl font-medium tracking-tight text-ink-black">
            {title}
          </h1>
          {updated !== undefined && (
            <p className="mt-2 text-[13px] text-secondary">{updated}</p>
          )}
          <div className="prose-plumb mt-8 flex flex-col gap-6">{children}</div>
        </article>
      </main>

      <SiteFooter tone="light" />
    </div>
  );
}

/** A titled section of a legal document. */
export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[17px] font-semibold text-ink-black">{heading}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink-black/90">
        {children}
      </div>
    </section>
  );
}
