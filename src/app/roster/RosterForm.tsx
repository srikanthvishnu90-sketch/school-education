"use client";

import { useState, useTransition, type ReactElement } from "react";
import { saveClassRoster } from "@/app/_world/teacherReflectionActions";

/**
 * The roster editor: one student name per line. Saving registers the names for
 * PII redaction (they are stripped before any model call) and echoes back the
 * cleaned list. Purely a class list — no grades, no scores.
 */
export default function RosterForm({ initial }: { initial: string[] }): ReactElement {
  const [text, setText] = useState(initial.join("\n"));
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(): void {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        const names = await saveClassRoster(text);
        setSaved(names);
        setText(names.join("\n"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <label htmlFor="roster" className="text-[13px] font-medium text-ink-black">
        Student names — one per line
      </label>
      <textarea
        id="roster"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder={"Jordan Lee\nSam Rivera\nTaylor Okafor"}
        className="mt-2 w-full resize-y rounded-control border border-ink-wash bg-white p-3 text-[14px] leading-relaxed text-ink-black outline-none focus:border-ink-tint"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save roster"}
        </button>
        {saved !== null && (
          <span className="text-[13px] text-secondary">
            Saved {saved.length} {saved.length === 1 ? "name" : "names"}.
          </span>
        )}
        {error !== null && (
          <span className="rounded-control border border-warm/50 bg-warm/5 px-2.5 py-1 text-[13px] text-ink-black">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
