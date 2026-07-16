"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { eraseMyReflectionData } from "@/app/_world/dataRightsActions";

/**
 * The student's right-to-erasure control. Two-step (arm, then confirm) so it is not
 * a one-tap accident, and it says plainly what will be deleted.
 */
export default function EraseButton(): ReactElement {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function erase(): void {
    startTransition(async () => {
      const result = await eraseMyReflectionData();
      if (result.ok) {
        setDone(
          result.deleted.sessions +
            result.deleted.summaries +
            result.deleted.performances +
            result.deleted.chats,
        );
        setArmed(false);
        router.refresh();
      }
    });
  }

  if (done !== null) {
    return (
      <p className="text-[13px] text-secondary">
        Your reflection data was deleted ({done} record{done === 1 ? "" : "s"}). You
        can start fresh any time.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="self-start text-[13px] text-secondary underline underline-offset-4 hover:text-ink-black"
        >
          Delete my reflection data
        </button>
      ) : (
        <div className="rounded-card border border-warm/40 bg-white p-4">
          <p className="text-[14px] text-ink-black">
            This permanently deletes every reflection, summary, and score tied to
            your account, and withdraws your consent. It can’t be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={erase}
              className="rounded-control bg-ink px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ink-tint disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete everything"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="rounded-control px-3 py-1.5 text-[13px] text-secondary hover:text-ink-black"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
