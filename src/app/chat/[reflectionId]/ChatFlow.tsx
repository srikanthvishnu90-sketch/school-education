"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import {
  selectReflectionAction,
  sendReflectionMessage,
} from "@/app/_world/reflectionActions";
import { useReducedMotion } from "@/app/_components/useReducedMotion";
import type { QuestionFormat } from "@/domain/intelligence/question";
import type {
  ChatHistoryMessage,
  ChatResult,
} from "@/app/_world/reflectionTypes";
import type { StudentInsightSummary } from "@/domain/intelligence/insight";
import Link from "next/link";

/**
 * The student reflection, as a familiar chat surface — a GPT-style wrapper: one
 * assistant thread down the middle, a sticky composer at the bottom, quick-reply
 * chips when the question is a scale or a choice. Calm, ink-toned, reward-free;
 * emotion is never colored good/bad.
 */

interface Bubble {
  id: string;
  sender: "student" | "ai";
  text: string;
}

const UNCERTAIN_RESPONSE = "I'm not sure";
const SKIP_RESPONSE = "I'd rather skip this question.";
const MAX_MESSAGE_LENGTH = 4_000;

const SCALE_LABELS: Record<string, string[]> = {
  rating: ["Not at all", "A little", "Somewhat", "Mostly", "Completely"],
  confidence_slider: [
    "Not yet",
    "A little",
    "Somewhat",
    "Confident",
    "Very confident",
  ],
};

function withUncertainty(options: readonly string[]): string[] {
  return options.includes(UNCERTAIN_RESPONSE)
    ? [...options]
    : [...options, UNCERTAIN_RESPONSE];
}

function optionsFor(format: QuestionFormat, given?: string[]): string[] | null {
  if (format === "rating" || format === "confidence_slider")
    return withUncertainty(SCALE_LABELS[format]);
  if (
    (format === "multiple_choice" ||
      format === "emotion_select" ||
      format === "multi_select") &&
    given &&
    given.length > 0
  ) {
    return withUncertainty(given);
  }
  return null;
}

function bubblesFromHistory(history: ChatHistoryMessage[]): Bubble[] {
  return history.map((message) => ({
    id: message.id,
    sender: message.sender,
    text: message.text,
  }));
}

function initialBubbles(initial: ChatResult): Bubble[] {
  if (initial.history !== undefined) return bubblesFromHistory(initial.history);
  if (initial.kind !== "question") return [];
  return [{ id: "initial-question", sender: "ai", text: initial.text }];
}

export default function ChatFlow({
  initial,
}: {
  initial: ChatResult;
}): ReactElement {
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initialBubbles(initial),
  );
  const [current, setCurrent] = useState<ChatResult>(initial);
  const [draft, setDraft] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const thread = useRef<HTMLElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const localId = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const nearThreadEnd = useRef(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (nearThreadEnd.current) {
      threadEnd.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [bubbles.length, pending, current.kind, reduceMotion]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (current.kind !== "question") return;
    if (optionsFor(current.format, current.options) === null) {
      composer.current?.focus();
    } else {
      firstOption.current?.focus();
    }
  }, [current]);

  function apply(result: ChatResult): void {
    setCurrent(result);
    setSelectedOptions([]);
    setError(null);
    if (result.history !== undefined) {
      setBubbles(bubblesFromHistory(result.history));
    } else if (result.kind === "question") {
      setBubbles((b) => [
        ...b,
        {
          id: `local-ai-${++localId.current}`,
          sender: "ai",
          text: result.text,
        },
      ]);
    }
  }

  function answer(text: string, restoreDraft = false): void {
    const normalized = text.trim();
    if (
      normalized.length === 0 ||
      current.kind !== "question" ||
      pending ||
      submitting.current
    ) {
      return;
    }

    const optimisticId = `local-student-${++localId.current}`;
    submitting.current = true;
    setError(null);
    setBubbles((b) => [
      ...b,
      { id: optimisticId, sender: "student", text: normalized },
    ]);
    if (restoreDraft) setDraft("");
    const sessionId = current.sessionId;
    startTransition(async () => {
      try {
        apply(await sendReflectionMessage(sessionId, normalized));
      } catch {
        setBubbles((items) => items.filter((item) => item.id !== optimisticId));
        if (restoreDraft) setDraft(normalized);
        setError("We couldn’t save that answer. Nothing was lost—try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  function toggleOption(option: string): void {
    setSelectedOptions((selected) => {
      if (option === UNCERTAIN_RESPONSE) {
        return selected.includes(option) ? [] : [option];
      }
      const withoutUncertain = selected.filter(
        (item) => item !== UNCERTAIN_RESPONSE,
      );
      return withoutUncertain.includes(option)
        ? withoutUncertain.filter((item) => item !== option)
        : [...withoutUncertain, option];
    });
  }

  const options =
    current.kind === "question"
      ? optionsFor(current.format, current.options)
      : null;
  const isMultiSelect =
    current.kind === "question" && current.format === "multi_select";
  const done = current.kind !== "question";

  return (
    <main
      data-theme="reflection-dark"
      aria-labelledby="reflection-title"
      className="flex h-[100svh] min-h-[100svh] flex-col overflow-hidden bg-chat-background text-chat-text"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-chat-divider px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar />
          <div className="min-w-0">
            <h1
              id="reflection-title"
              className="text-[14px] font-medium leading-none text-chat-text"
            >
              Reflection
            </h1>
            <p className="mt-1 text-[12px] text-chat-muted">
              One question at a time
            </p>
          </div>
        </div>
        <Link
          href="/courses"
          className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-[13px] text-chat-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
        >
          My courses
        </Link>
      </header>

      <p className="shrink-0 border-b border-chat-divider bg-chat-surface px-4 py-2 text-center text-[12px] leading-relaxed text-chat-muted">
        Your answers don’t change your score. Teachers see a summary, not this
        chat. Safety concerns create a counselor alert.
      </p>

      <section
        ref={thread}
        role="log"
        aria-label="Reflection conversation"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={pending}
        onScroll={(event) => {
          const target = event.currentTarget;
          nearThreadEnd.current =
            target.scrollHeight - target.scrollTop - target.clientHeight < 96;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 py-8 sm:px-6 sm:py-10">
          {bubbles.map((b) =>
            b.sender === "ai" ? (
              <AiTurn key={b.id} text={b.text} />
            ) : (
              <StudentTurn key={b.id} text={b.text} />
            ),
          )}

          {pending && <TypingTurn />}

          {current.kind === "safety" && <SafetyTurn />}
          {current.kind === "summary" && (
            <SummaryTurn
              summary={current.summary}
              sessionId={current.sessionId}
              initialAction={current.selectedAction}
            />
          )}

          <div ref={threadEnd} />
        </div>
      </section>

      {!done && (
        <footer className="shrink-0 border-t border-chat-divider bg-chat-background">
          <div className="mx-auto max-w-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {error !== null && (
              <p
                role="alert"
                className="mb-3 rounded-control border border-chat-control bg-chat-surface px-3 py-2 text-[13px] leading-relaxed text-chat-text"
              >
                {error}
              </p>
            )}
            {options && (
              <div className="mb-3">
                <div
                  className="flex max-h-36 flex-wrap gap-2 overflow-y-auto py-0.5"
                  role="group"
                  aria-label={
                    isMultiSelect
                      ? "Choose one or more responses"
                      : "Suggested responses"
                  }
                >
                  {options.map((opt, index) => {
                    const selected =
                      isMultiSelect && selectedOptions.includes(opt);
                    return (
                      <button
                        ref={index === 0 ? firstOption : undefined}
                        key={opt}
                        type="button"
                        disabled={pending}
                        aria-pressed={isMultiSelect ? selected : undefined}
                        onClick={() =>
                          isMultiSelect ? toggleOption(opt) : answer(opt)
                        }
                        className={`min-h-11 rounded-full border px-4 py-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-background disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? "border-chat-accent bg-chat-raised text-chat-text"
                            : "border-chat-control bg-chat-surface text-chat-text hover:border-chat-accent hover:bg-chat-raised"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {isMultiSelect && (
                  <button
                    type="button"
                    disabled={pending || selectedOptions.length === 0}
                    onClick={() => answer(selectedOptions.join(", "))}
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-control bg-chat-text px-5 py-2 text-sm font-medium text-chat-background transition-colors hover:bg-chat-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-background disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue
                  </button>
                )}
              </div>
            )}

            {current.required === false && (
              <button
                type="button"
                disabled={pending}
                onClick={() => answer(SKIP_RESPONSE)}
                className="mb-3 inline-flex min-h-11 items-center rounded-control px-2 text-[13px] text-chat-muted underline-offset-4 hover:text-chat-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Skip this optional question
              </button>
            )}

            {options === null && (
              <>
                <div className="flex items-end gap-2 rounded-2xl border border-chat-control bg-chat-surface px-3 py-2.5 transition-colors focus-within:border-chat-accent focus-within:ring-2 focus-within:ring-chat-accent focus-within:ring-offset-2 focus-within:ring-offset-chat-background sm:px-4">
                  <textarea
                    ref={composer}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        answer(draft, true);
                      }
                    }}
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder="Message…"
                    aria-label="Message"
                    aria-describedby="reflection-composer-hint"
                    className="min-h-7 max-h-40 flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed text-chat-text outline-none [field-sizing:content] placeholder:text-chat-muted"
                  />
                  <button
                    type="button"
                    disabled={pending || draft.trim().length === 0}
                    onClick={() => answer(draft, true)}
                    aria-label="Send"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chat-text text-chat-background transition-colors hover:bg-chat-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-surface disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M8 13V3M8 3L4 7M8 3l4 4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <p
                  id="reflection-composer-hint"
                  className="mt-2 text-center text-[12px] text-chat-muted"
                >
                  Enter to send · Shift+Enter for a new line
                </p>
              </>
            )}
          </div>
        </footer>
      )}
    </main>
  );
}

function Avatar(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-chat-divider bg-chat-surface text-[13px] font-medium text-chat-accent"
    >
      p
    </span>
  );
}

function AiTurn({ text }: { text: string }): ReactElement {
  return (
    <div className="flex gap-3" role="article" aria-label="Reflection">
      <Avatar />
      <div className="min-w-0 flex-1 whitespace-pre-wrap pt-1 text-[15px] leading-relaxed text-chat-text [overflow-wrap:anywhere]">
        {text}
      </div>
    </div>
  );
}

function StudentTurn({ text }: { text: string }): ReactElement {
  return (
    <div className="flex justify-end" role="article" aria-label="You">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-chat-raised px-4 py-2.5 text-[15px] leading-relaxed text-chat-text [overflow-wrap:anywhere] sm:max-w-[75%]">
        {text}
      </div>
    </div>
  );
}

function TypingTurn(): ReactElement {
  return (
    <div
      className="flex gap-3"
      role="status"
      aria-label="Reflection is responding"
    >
      <Avatar />
      <div className="flex items-center gap-1 pt-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-chat-muted motion-reduce:animate-none"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function SafetyTurn(): ReactElement {
  return (
    <div className="flex gap-3">
      <Avatar />
      <div
        role="alert"
        className="min-w-0 flex-1 rounded-card border border-chat-divider bg-chat-surface p-4 text-[15px] leading-relaxed text-chat-text"
      >
        <p>
          Thank you for sharing that. What you wrote sounds important. A
          counselor alert was added to your school&rsquo;s support queue so a
          caring adult can check in with you.
        </p>
        <p className="mt-3 text-[13px] text-chat-muted">
          If you might be in immediate danger, tell a nearby trusted adult or
          call emergency services now. In the U.S., you can also call or text
          988.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="tel:988"
            className="inline-flex min-h-11 items-center rounded-control bg-chat-text px-4 text-sm font-medium text-chat-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-surface"
          >
            Call 988
          </a>
          <a
            href="sms:988"
            className="inline-flex min-h-11 items-center rounded-control border border-chat-control bg-chat-raised px-4 text-sm font-medium text-chat-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-surface"
          >
            Text 988
          </a>
          <Link
            href="/courses"
            className="inline-flex min-h-11 items-center rounded-control px-2 text-sm text-chat-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
          >
            Back to courses
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryTurn({
  summary,
  sessionId,
  initialAction,
}: {
  summary: StudentInsightSummary;
  sessionId: string;
  initialAction?: string;
}): ReactElement {
  const [chosen, setChosen] = useState<string | null>(initialAction ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(action: string): void {
    if (pending || chosen !== null) return;
    setChosen(action);
    setSaveError(null);
    startTransition(async () => {
      try {
        await selectReflectionAction(sessionId, action);
      } catch {
        setChosen(null);
        setSaveError(
          "We couldn’t save that next step. Please choose it again.",
        );
      }
    });
  }

  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className="rounded-card border border-chat-divider bg-chat-surface p-5">
          <p className="text-[13px] font-medium text-chat-accent">
            What this reflection suggests
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-chat-text">
            {summary.studentFacingSummary}
          </p>

          {saveError !== null && (
            <p
              role="alert"
              className="mt-4 rounded-control border border-chat-control bg-chat-raised px-3 py-2 text-[13px] leading-relaxed text-chat-text"
            >
              {saveError}
            </p>
          )}

          {chosen === null ? (
            <>
              <p className="mt-5 text-[13px] font-medium text-chat-text">
                Choose one small next step:
              </p>
              <div className="mt-3 grid gap-2">
                {summary.recommendedActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={pending}
                    onClick={() => choose(action)}
                    className="min-h-11 rounded-control border border-chat-control bg-chat-raised px-4 py-3 text-left text-[14px] text-chat-text transition-colors hover:border-chat-accent hover:bg-chat-divider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chat-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-control bg-chat-raised px-4 py-3">
              <p className="text-[13px] text-chat-muted">Your next step</p>
              <p className="mt-1 text-[15px] text-chat-text">{chosen}</p>
            </div>
          )}
        </div>
        <Link
          href="/timeline"
          className="mt-2 inline-flex min-h-11 items-center rounded-control px-1 text-[13px] text-chat-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
        >
          See how your read compares to your results over time →
        </Link>
        <Link
          href="/courses"
          className="ml-4 mt-2 inline-flex min-h-11 items-center rounded-control px-1 text-[13px] text-chat-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
        >
          Back to my courses
        </Link>
      </div>
    </div>
  );
}
