"use client";

import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { grantReflectionConsent } from "@/app/_world/consentActions";

const AGE_OPTIONS: ReadonlyArray<{ label: string; under13: boolean }> = [
  { label: "13 or older", under13: false },
  { label: "Under 13", under13: true },
];

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
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = AGE_OPTIONS.findIndex(
    (option) => option.under13 === under13,
  );
  // When nothing is selected yet, the first option is the roving-tabindex entry
  // point so the group is reachable by keyboard.
  const focusableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function selectOption(index: number): void {
    setUnder13(AGE_OPTIONS[index].under13);
    setError(null);
  }

  function handleOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight": {
        event.preventDefault();
        const next = (index + 1) % AGE_OPTIONS.length;
        selectOption(next);
        optionRefs.current[next]?.focus();
        break;
      }
      case "ArrowUp":
      case "ArrowLeft": {
        event.preventDefault();
        const previous = (index - 1 + AGE_OPTIONS.length) % AGE_OPTIONS.length;
        selectOption(previous);
        optionRefs.current[previous]?.focus();
        break;
      }
      case " ":
      case "Enter": {
        event.preventDefault();
        selectOption(index);
        break;
      }
      default:
        break;
    }
  }

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
        <legend
          id="age-group-legend"
          className="text-[13px] font-medium text-shell-text"
        >
          How old are you?
        </legend>
        <div
          role="radiogroup"
          aria-labelledby="age-group-legend"
          className="mt-2 flex flex-col gap-2"
        >
          {AGE_OPTIONS.map((option, index) => (
            <Choice
              key={option.label}
              label={option.label}
              checked={under13 === option.under13}
              tabIndex={index === focusableIndex ? 0 : -1}
              onSelect={() => selectOption(index)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              buttonRef={(node) => {
                optionRefs.current[index] = node;
              }}
            />
          ))}
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
        <p
          role="alert"
          className="mt-3 rounded-control border border-warm/50 bg-warm/5 px-3 py-2 text-[13px] text-ink-black"
        >
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
  tabIndex,
  onSelect,
  onKeyDown,
  buttonRef,
}: {
  label: string;
  checked: boolean;
  tabIndex: number;
  onSelect: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
}): ReactElement {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
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
