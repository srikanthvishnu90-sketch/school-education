"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import {
  approveReflectionQuestions,
  type DraftQuestionView,
} from "@/app/_world/teacherReflectionActions";

/**
 * The human gate (Part 1 #2). The AI drafts these questions; a teacher reads them
 * and decides. Until "Approve", the student gate treats the reflection as
 * unavailable — no AI output reaches a student without a person's approval. The
 * teacher can also delete the lesson (below) and redraft if the questions are wrong.
 */

const CATEGORY_LABELS: Record<DraftQuestionView["category"], string> = {
  technical: "Understanding",
  emotional: "How it felt",
  behavioral: "What they did",
  metacognitive: "Thinking about thinking",
};

export default function ApproveQuestions({
  reflectionId,
  questions,
}: {
  reflectionId: string;
  questions: DraftQuestionView[];
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function approve(): void {
    setError(null);
    startTransition(async () => {
      const result = await approveReflectionQuestions(reflectionId);
      if (result.ok) {
        router.refresh();
      } else {
        setError("That didn't save. Reload the page and try approving again.");
      }
    });
  }

  return (
    <section className="mt-10 rounded-card border border-ink-wash bg-white p-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        Review before students see it
      </p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink-black">
        plumb drafted these questions
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-secondary">
        These were drafted from your lesson. Read them, then approve to open the
        reflection to your students. Nothing is shown to a student until you do.
        If they don&rsquo;t fit, delete the lesson below and enter it again.
      </p>

      <ol className="mt-5 flex flex-col gap-3">
        {questions.map((q, i) => (
          <li
            key={i}
            className="rounded-control border border-ink-wash px-4 py-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-tint">
              {CATEGORY_LABELS[q.category]}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-black">{q.text}</p>
            {q.options !== undefined && q.options.length > 0 && (
              <p className="mt-1.5 text-[13px] text-secondary">
                {q.options.join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ol>

      {error !== null && (
        <p role="alert" className="mt-4 text-[14px] text-ink-black">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className="mt-5 min-h-11 rounded-control bg-ink px-5 text-[15px] font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Approving…" : "Approve — open to students"}
      </button>
    </section>
  );
}
