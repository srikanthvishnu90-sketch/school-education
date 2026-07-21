"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { deleteLesson } from "@/app/_world/teacherReflectionActions";

/**
 * Delete a lesson — two-step so it's never a one-tap accident. Says plainly what
 * it removes (the lesson and its reflection prompt) and what it keeps (students'
 * own reflections stay on their timelines).
 */
export default function DeleteLessonButton({
  reflectionId,
}: {
  reflectionId: string;
}): ReactElement {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm(): void {
    setError(null);
    startTransition(async () => {
      const result = await deleteLesson(reflectionId);
      if (result.ok) {
        router.push("/lessons");
        router.refresh();
      } else {
        setError("Couldn’t delete this lesson. Reload and try again.");
        setArmed(false);
      }
    });
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-[13px] text-secondary underline-offset-4 hover:text-ink-black hover:underline"
      >
        Delete this lesson
      </button>
    );
  }

  return (
    <div className="rounded-card border border-ink-wash bg-white p-4">
      <p className="text-[14px] leading-relaxed text-ink-black">
        Delete this lesson and its reflection prompt? Students&rsquo; own reflections
        stay on their timelines — this just removes it from your board and stops new
        reflections on it.
      </p>
      {error !== null && (
        <p role="alert" className="mt-2 text-[13px] text-ink-black">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete lesson"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="text-[13px] text-secondary hover:text-ink-black"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
