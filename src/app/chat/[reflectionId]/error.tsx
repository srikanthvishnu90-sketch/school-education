"use client";

import Link from "next/link";
import type { ReactElement } from "react";

export default function ReflectionError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  return (
    <main
      data-theme="reflection-dark"
      className="flex min-h-[100svh] items-center justify-center bg-chat-background px-6 text-chat-text"
    >
      <section
        aria-labelledby="reflection-error-title"
        className="w-full max-w-md rounded-card border border-chat-divider bg-chat-surface p-6"
      >
        <p className="text-sm font-medium text-chat-accent">
          Reflection paused
        </p>
        <h1 id="reflection-error-title" className="mt-2 text-xl font-medium">
          We couldn’t open this lesson
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-chat-muted">
          Try opening the reflection again. If it still doesn&rsquo;t work,
          return to your lesson list and let your teacher know.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-control bg-chat-text px-4 text-sm font-medium text-chat-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-surface"
          >
            Try again
          </button>
          <Link
            href="/reflections"
            className="inline-flex min-h-11 items-center rounded-control px-3 text-sm text-chat-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
          >
            Back to lessons
          </Link>
        </div>
      </section>
    </main>
  );
}
