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
import type { QuestionFormat } from "@/domain/intelligence/question";
import type { ChatResult } from "@/app/_world/reflectionTypes";
import type { StudentInsightSummary } from "@/domain/intelligence/insight";

/**
 * The student reflection, as a familiar chat surface — a GPT-style wrapper: one
 * assistant thread down the middle, a sticky composer at the bottom, quick-reply
 * chips when the question is a scale or a choice. Calm, ink-toned, reward-free;
 * emotion is never colored good/bad.
 */

interface Bubble {
  sender: "student" | "ai";
  text: string;
}

const SCALE_LABELS: Record<string, string[]> = {
  rating: ["Not at all", "A little", "Somewhat", "Mostly", "Completely"],
  confidence_slider: ["Not yet", "A little", "Somewhat", "Confident", "Very confident"],
};

function optionsFor(format: QuestionFormat, given?: string[]): string[] | null {
  if (format === "rating" || format === "confidence_slider") return SCALE_LABELS[format];
  if (
    (format === "multiple_choice" || format === "emotion_select" || format === "multi_select") &&
    given &&
    given.length > 0
  ) {
    return given;
  }
  return null;
}

export default function ChatFlow({ initial }: { initial: ChatResult }): ReactElement {
  const first = initial.kind === "question" ? [{ sender: "ai" as const, text: initial.text }] : [];
  const [bubbles, setBubbles] = useState<Bubble[]>(first);
  const [current, setCurrent] = useState<ChatResult>(initial);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles.length, pending, current.kind]);

  function apply(result: ChatResult): void {
    setCurrent(result);
    if (result.kind === "question") {
      setBubbles((b) => [...b, { sender: "ai", text: result.text }]);
    }
  }

  function answer(text: string): void {
    if (text.trim().length === 0 || current.kind !== "question" || pending) return;
    setBubbles((b) => [...b, { sender: "student", text }]);
    setDraft("");
    const sessionId = current.sessionId;
    startTransition(async () => {
      apply(await sendReflectionMessage(sessionId, text));
    });
  }

  const options = current.kind === "question" ? optionsFor(current.format, current.options) : null;
  const done = current.kind !== "question";

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-ink-wash px-4 py-3">
        <Avatar />
        <div>
          <p className="text-[14px] font-medium leading-none text-ink-black">
            Reflection
          </p>
          <p className="mt-0.5 text-[12px] text-secondary">Just between us</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
          {bubbles.map((b, i) =>
            b.sender === "ai" ? (
              <AiTurn key={i} text={b.text} />
            ) : (
              <StudentTurn key={i} text={b.text} />
            ),
          )}

          {pending && <TypingTurn />}

          {current.kind === "safety" && <SafetyTurn />}
          {current.kind === "summary" && (
            <SummaryTurn summary={current.summary} sessionId={current.sessionId} />
          )}

          <div ref={threadEnd} />
        </div>
      </div>

      {!done && (
        <div className="border-t border-ink-wash bg-white">
          <div className="mx-auto max-w-2xl px-4 py-4">
            {options && (
              <div className="mb-3 flex flex-wrap gap-2">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={pending}
                    onClick={() => answer(opt)}
                    className="rounded-full border border-ink-wash bg-paper px-4 py-1.5 text-[14px] text-ink-black transition-colors hover:border-ink-tint hover:bg-ink-wash disabled:opacity-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-3xl border border-ink-wash bg-paper px-4 py-2.5 focus-within:border-ink-tint">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    answer(draft);
                  }
                }}
                rows={1}
                placeholder="Message…"
                className="max-h-40 flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-ink-black outline-none placeholder:text-secondary"
              />
              <button
                type="button"
                disabled={pending || draft.trim().length === 0}
                onClick={() => answer(draft)}
                aria-label="Send"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors hover:bg-ink-tint disabled:opacity-30"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[12px] text-secondary">
              Enter to send · Shift+Enter for a new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar(): ReactElement {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-medium text-white">
      p
    </span>
  );
}

function AiTurn({ text }: { text: string }): ReactElement {
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="flex-1 pt-1 text-[15px] leading-relaxed text-ink-black">
        {text}
      </div>
    </div>
  );
}

function StudentTurn({ text }: { text: string }): ReactElement {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-3xl bg-ink-wash px-4 py-2.5 text-[15px] leading-relaxed text-ink-black">
        {text}
      </div>
    </div>
  );
}

function TypingTurn(): ReactElement {
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="flex items-center gap-1 pt-3" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary"
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
      <div className="flex-1 rounded-card border border-ink-wash bg-paper p-4 text-[15px] leading-relaxed text-ink-black">
        Thank you for sharing that. What you wrote sounds important, and a caring
        adult at your school is the right person to help with it — they&rsquo;ll be
        let know so they can check in with you.
        <p className="mt-3 text-[13px] text-secondary">
          If you are in immediate danger, tell an adult now or call or text 988.
        </p>
      </div>
    </div>
  );
}

function SummaryTurn({
  summary,
  sessionId,
}: {
  summary: StudentInsightSummary;
  sessionId: string;
}): ReactElement {
  const [chosen, setChosen] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(action: string): void {
    setChosen(action);
    startTransition(async () => {
      await selectReflectionAction(sessionId, action);
    });
  }

  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="flex-1">
        <div className="rounded-card border border-ink-wash bg-paper p-5">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-secondary">
            What you noticed today
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-black">
            {summary.studentFacingSummary}
          </p>

          {chosen === null ? (
            <>
              <p className="mt-5 text-[13px] font-medium text-ink-black">
                Choose one small next step:
              </p>
              <div className="mt-3 grid gap-2">
                {summary.recommendedActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => choose(action)}
                    className="rounded-control border border-ink-wash bg-white px-4 py-3 text-left text-[14px] text-ink-black transition-colors hover:border-ink-tint hover:bg-ink-wash"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-control bg-ink-wash px-4 py-3">
              <p className="text-[13px] text-secondary">Your next step</p>
              <p className="mt-1 text-[15px] text-ink-black">{chosen}</p>
            </div>
          )}
        </div>
        <a
          href="/timeline"
          className="mt-3 inline-block text-[13px] text-ink-tint hover:underline"
        >
          See how your read compares to your results over time →
        </a>
      </div>
    </div>
  );
}
