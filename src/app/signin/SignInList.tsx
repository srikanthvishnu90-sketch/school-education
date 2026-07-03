"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";
import { signIn } from "@/app/_world/session";
import { Stage } from "@/app/_ui/atoms";

/**
 * Pick-your-name sign-in (no passwords in this pre-infra build). Choosing sets an
 * http-only session cookie server-side, then starts the cycle. From here on the
 * surface knows who you are from the session alone.
 */
export default function SignInList({
  students,
  assessmentId,
}: {
  students: { id: string; name: string }[];
  assessmentId: string;
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(id: string): void {
    startTransition(async () => {
      await signIn(id);
      router.push(`/predict/${assessmentId}`);
    });
  }

  return (
    <Stage eyebrow="Sign in" question="Who are you?">
      <p className="mb-5 text-[15px] text-secondary">Pick your name to start.</p>
      <div className="grid gap-2">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => pick(s.id)}
            disabled={pending}
            className="w-full rounded-control border border-ink-wash bg-white px-4 py-3 text-left text-[15px] text-ink-black transition-colors hover:border-ink-tint/50 disabled:opacity-50"
          >
            {s.name}
          </button>
        ))}
      </div>
    </Stage>
  );
}
