"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";
import { signIn } from "@/app/_world/session";
import { Stage } from "@/app/_ui/atoms";

/**
 * Pick-who-you-are sign-in (no passwords in this pre-infra build). Choosing sets
 * an http-only session cookie server-side, then routes to that role's surface.
 */
export interface SignInEntry {
  id: string;
  name: string;
  role: string;
  href: string;
}

export default function SignInList({
  entries,
}: {
  entries: SignInEntry[];
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(entry: SignInEntry): void {
    startTransition(async () => {
      await signIn(entry.id);
      router.push(entry.href);
    });
  }

  return (
    <Stage eyebrow="Sign in" question="Who are you?">
      <p className="mb-5 text-[15px] text-secondary">Pick your name to start.</p>
      <div className="grid gap-2">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => pick(entry)}
            disabled={pending}
            className="flex w-full items-center justify-between rounded-control border border-ink-wash bg-white px-4 py-3 text-left text-[15px] text-ink-black transition-colors hover:border-ink-tint/50 disabled:opacity-50"
          >
            <span>{entry.name}</span>
            <span className="text-[12px] uppercase tracking-[0.16em] text-secondary">
              {entry.role}
            </span>
          </button>
        ))}
      </div>
    </Stage>
  );
}
