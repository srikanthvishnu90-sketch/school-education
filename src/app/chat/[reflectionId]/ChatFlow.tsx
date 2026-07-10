"use client";

import { useState, useTransition, type ReactElement } from "react";
import {
  selectReflectionAction,
  sendReflectionMessage,
} from "@/app/_world/reflectionActions";
import type { QuestionFormat } from "@/domain/intelligence/question";
import type { ChatResult } from "@/app/_world/reflectionTypes";
import type { StudentInsightSummary } from "@/domain/intelligence/insight";

/**
 * The adaptive reflection chat — one question at a time, the input adapting to the
 * question's format, ending in a summary the student confirms and a next step they
 * choose. Calm, ink-toned, reward-free. Emotion is never colored good/bad.
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

  function apply(result: ChatResult): void {
    setCurrent(result);
    if (result.kind === "question") {
      setBubbles((b) => [...b, { sender: "ai", text: result.text }]);
    }
  }

  function answer(text: string): void {
    if (text.trim().length === 0 || current.kind !== "question") return;
    setBubbles((b) => [...b, { sender: "student", text }]);
    setDraft("");
    const sessionId = current.sessionId;
    startTransition(async () => {
      apply(await sendReflectionMessage(sessionId, text));
    });
  }

  if (current.kind === "safety") {
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-card border border-ink-wash bg-white p-6 text-center">
          <p className="text-[15px] leading-relaxed text-ink-black">
            Thank you for sharing that. What you wrote sounds important, and a caring
            adult at your school is the right person to help with it. They&rsquo;ll be
            let know so they can check in with you.
          </p>
          <p className="mt-4 text-[13px] text-secondary">
            If you are in immediate danger, tell an adult now or call or text 988.
          </p>
        </div>
      </Shell>
    );
  }

  if (current.kind === "summary") {
    return (
      <Shell>
        <Conversation bubbles={bubbles} />
        <SummaryCard summary={current.summary} sessionId={current.sessionId} />
      </Shell>
    );
  }

  const options = optionsFor(current.format, current.options);
  return (
    <Shell>
      <Conversation bubbles={bubbles} />
      <div className="sticky bottom-0 mt-6 border-t border-ink-wash bg-paper/90 pt-4 backdrop-blur">
        {options ? (
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={pending}
                onClick={() => answer(opt)}
                className="rounded-control border border-ink-wash bg-white px-4 py-2 text-[14px] text-ink-black transition-colors hover:border-ink-tint hover:bg-ink-wash disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) answer(draft);
              }}
              rows={2}
              placeholder="Say it in your own words…"
              className="flex-1 resize-none rounded-control border border-ink-wash bg-white px-3 py-2 text-[15px] text-ink-black outline-none focus:border-ink-tint"
            />
            <button
              type="button"
              disabled={pending || draft.trim().length === 0}
              onClick={() => answer(draft)}
              className="rounded-control bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
        <p className="mb-6 text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
          Reflection
        </p>
        {children}
      </div>
    </div>
  );
}

function Conversation({ bubbles }: { bubbles: Bubble[] }): ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-3">
      {bubbles.map((b, i) => (
        <div
          key={i}
          className={b.sender === "ai" ? "flex justify-start" : "flex justify-end"}
        >
          <div
            className={
              b.sender === "ai"
                ? "max-w-[85%] rounded-card rounded-tl-sm border border-ink-wash bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-black"
                : "max-w-[85%] rounded-card rounded-tr-sm bg-ink-tint px-4 py-3 text-[15px] leading-relaxed text-white"
            }
          >
            {b.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
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
    <div className="mt-6 rounded-card border border-ink-wash bg-white p-6">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        What you noticed today
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-black">
        {summary.studentFacingSummary}
      </p>
      {chosen === null ? (
        <>
          <p className="mt-6 text-[13px] font-medium text-ink-black">
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
        <div className="mt-6 rounded-control bg-ink-wash px-4 py-3">
          <p className="text-[13px] text-secondary">Your next step</p>
          <p className="mt-1 text-[15px] text-ink-black">{chosen}</p>
        </div>
      )}
      <a
        href="/timeline"
        className="mt-5 inline-block text-[13px] text-ink-tint hover:underline"
      >
        See how your read compares to your results over time →
      </a>
    </div>
  );
}
