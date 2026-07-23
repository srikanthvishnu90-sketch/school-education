import type { ReactElement } from "react";

export default function ReflectionLoading(): ReactElement {
  return (
    <main id="main-content" tabIndex={-1}
      data-theme="reflection-dark"
      className="flex min-h-[100svh] items-center justify-center bg-chat-background px-6 text-chat-text"
    >
      <div
        role="status"
        className="flex items-center gap-3 text-sm text-chat-muted"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-chat-accent motion-reduce:animate-none"
        />
        Opening your lesson…
      </div>
    </main>
  );
}
