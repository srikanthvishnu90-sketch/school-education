"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { recordPrediction } from "@/app/_world/actions";
import { Dots, QuietLink, Stage } from "@/app/_ui/atoms";
import { TapScale, type TapOption } from "@/app/_ui/controls";

/**
 * The performance + prediction flow — one item per screen. The student SOLVES the
 * item (their real answer, graded server-side) and, before seeing any grade, taps
 * a coarse five-point confidence (never a precision slider). Answering is the
 * performance; the confidence is the pre-registered belief. Then one global
 * estimate. Progress is quiet dots; every screen holds one item.
 */

const CONFIDENCE: readonly TapOption[] = [
  { label: "Not sure at all", value: 0.1 },
  { label: "A little sure", value: 0.3 },
  { label: "Kind of sure", value: 0.5 },
  { label: "Pretty sure", value: 0.7 },
  { label: "Very sure", value: 0.9 },
];

const OVERALL: readonly TapOption[] = [
  { label: "About 1 out of 5", value: 0.2 },
  { label: "About 2 out of 5", value: 0.4 },
  { label: "About half", value: 0.5 },
  { label: "About 3 out of 5", value: 0.6 },
  { label: "4 out of 5 or more", value: 0.8 },
];

export interface PredictItem {
  id: string;
  prompt: string;
}

export default function PredictFlow({
  assessmentId,
  items,
}: {
  assessmentId: string;
  items: PredictItem[];
}): ReactElement {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => items.map(() => ""));
  const [confidences, setConfidences] = useState<number[]>(
    () => items.map(() => Number.NaN),
  );
  const [globalEstimate, setGlobalEstimate] = useState<number | null>(null);
  const [needAnswer, setNeedAnswer] = useState(false);
  const [pending, startTransition] = useTransition();

  const totalSteps = items.length + 1;
  const onItemStep = step < items.length;

  function setAnswer(value: string): void {
    setNeedAnswer(false);
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
  }

  function chooseConfidence(value: number): void {
    if (answers[step].trim().length === 0) {
      setNeedAnswer(true);
      return;
    }
    setConfidences((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
    setStep((s) => s + 1);
  }

  function chooseOverall(value: number): void {
    setGlobalEstimate(value);
    startTransition(async () => {
      await recordPrediction({
        assessmentId,
        answers,
        confidences,
        globalPredicted: value,
      });
      router.push(`/result/${assessmentId}`);
    });
  }

  const back =
    step > 0 ? (
      <button
        type="button"
        onClick={() => setStep((s) => s - 1)}
        className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
      >
        Back
      </button>
    ) : (
      <QuietLink href="/map">Leave</QuietLink>
    );

  if (onItemStep) {
    const item = items[step];
    const current = confidences[step];
    return (
      <Stage
        eyebrow={`Question ${step + 1} of ${items.length}`}
        question={item.prompt}
        footer={
          <div className="flex items-center justify-between">
            {back}
            <Dots total={totalSteps} index={step} />
          </div>
        }
      >
        <label htmlFor="answer" className="text-[15px] text-secondary">
          Work it out and write your answer:
        </label>
        <input
          id="answer"
          type="text"
          value={answers[step]}
          onChange={(e) => setAnswer(e.target.value)}
          aria-label="Your answer"
          placeholder="Your answer"
          className="mt-2 w-full rounded-control border border-ink-wash bg-white px-4 py-3 text-[15px] text-ink-black outline-none transition-colors focus:border-ink-tint"
        />
        <p className="mb-3 mt-6 text-[15px] text-secondary">
          Before you see if it&rsquo;s right — how sure are you?
        </p>
        <TapScale
          options={CONFIDENCE}
          value={Number.isNaN(current) ? null : current}
          onChange={chooseConfidence}
        />
        {needAnswer && (
          <p className="mt-3 text-[13px] text-secondary">
            Write your answer first, then say how sure you are.
          </p>
        )}
      </Stage>
    );
  }

  return (
    <Stage
      eyebrow="All together"
      question="All together, how many do you think you got right?"
      footer={
        <div className="flex items-center justify-between">
          {back}
          <Dots total={totalSteps} index={step} />
        </div>
      }
    >
      <TapScale
        options={OVERALL}
        value={globalEstimate}
        onChange={chooseOverall}
      />
      {pending && (
        <p className="mt-6 text-sm text-secondary">Checking your work…</p>
      )}
    </Stage>
  );
}
