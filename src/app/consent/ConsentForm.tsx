"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { grantReflectionConsent } from "@/app/_world/consentActions";

/**
 * The consent screen a student sees before their first reflection. It is plain
 * and honest: it says what is collected, who sees it, and that a parent must
 * consent for under-13s. Nothing is captured until this is granted.
 */
export default function ConsentForm({ next }: { next: string }): ReactElement {
  const router = useRouter();
  const [under13, setUnder13] = useState<boolean | null>(null);
  const [parentConsent, setParentConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(): void {
    setError(null);
    if (under13 === null) {
      setError("Let us know your age group first.");
      return;
    }
    startTransition(async () => {
      const result = await grantReflectionConsent(under13, parentConsent);
      if (result.ok) router.push(next);
      else setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="w-full max-w-md">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-shell-muted">
        Before you start
      </p>
      <h1 className="mt-2 text-[24px] font-normal tracking-tight text-shell-text">
        A quick okay to reflect
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-shell-muted">
        A reflection asks how a lesson went and how it felt. Your answers are
        private — your teacher sees a short summary, never this chat, and your
        score never changes because of it. You can stop any time.
      </p>

      <fieldset className="mt-6">
        <legend className="text-[13px] font-medium text-shell-text">
          How old are you?
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          <Choice
            label="13 or older"
            checked={under13 === false}
            onSelect={() => {
              setUnder13(false);
              setError(null);
            }}
          />
          <Choice
            label="Under 13"
            checked={under13 === true}
            onSelect={() => {
              setUnder13(true);
              setError(null);
            }}
          />
        </div>
      </fieldset>

      {under13 === true && (
        <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-shell-border bg-shell-panel p-3 text-[13px] leading-relaxed text-shell-text">
          <input
            type="checkbox"
            checked={parentConsent}
            onChange={(e) => setParentConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-shell-sage"
          />
          A parent or guardian is here and gives permission for me to reflect.
        </label>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-[13px] text-subject-math">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="mt-6 h-11 w-full rounded-full bg-shell-sage text-[14px] font-medium text-shell-background transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Saving…" : "I understand — let’s reflect"}
      </button>
    </div>
  );
}

function Choice({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-[14px] transition-colors ${
        checked
          ? "border-shell-sage/60 bg-shell-panel text-shell-text"
          : "border-shell-border text-shell-muted hover:text-shell-text"
      }`}
    >
      <span
        className={`h-3.5 w-3.5 rounded-full border ${
          checked ? "border-shell-sage bg-shell-sage" : "border-shell-muted"
        }`}
        aria-hidden
      />
      {label}
    </button>
  );
}
