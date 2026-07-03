"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { recordPrediction } from "@/app/_world/actions";
import { Dots, QuietLink, Stage } from "@/app/_ui/atoms";
import { TapScale, type TapOption } from "@/app/_ui/controls";

/**
 * The prediction flow — one item per screen, a coarse five-point tap for
 * confidence (never a precision slider), then one global estimate. Progress is
 * quiet dots. Every screen holds exactly one decision.
 */

const CONFIDENCE: readonly TapOption[] = [
  { label: "Not confident", value: 0.1 },
  { label: "A little confident", value: 0.3 },
  { label: "Somewhat confident", value: 0.5 },
  { label: "Fairly confident", value: 0.7 },
  { label: "Very confident", value: 0.9 },
];

const OVERALL: readonly TapOption[] = [
  { label: "About 1 in 5", value: 0.2 },
  { label: "About 2 in 5", value: 0.4 },
  { label: "About half", value: 0.5 },
  { label: "About 3 in 5", value: 0.6 },
  { label: "4 in 5 or more", value: 0.8 },
];

export interface PredictItem {
  id: string;
  prompt: string;
}

export default function PredictFlow({
  assessmentId,
  studentId,
  items,
}: {
  assessmentId: string;
  studentId: string;
  items: PredictItem[];
}): ReactElement {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [confidences, setConfidences] = useState<number[]>(
    () => items.map(() => Number.NaN),
  );
  const [globalEstimate, setGlobalEstimate] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const totalSteps = items.length + 1;
  const onItemStep = step < items.length;

  function chooseConfidence(value: number): void {
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
        studentId,
        assessmentId,
        confidences,
        globalPredicted: value,
      });
      router.push(
        `/result/${assessmentId}?student=${encodeURIComponent(studentId)}`,
      );
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
        eyebrow={`Predict · question ${step + 1} of ${items.length}`}
        question={item.prompt}
        footer={
          <div className="flex items-center justify-between">
            {back}
            <Dots total={totalSteps} index={step} />
          </div>
        }
      >
        <p className="mb-5 text-[15px] text-secondary">
          Before you see the result — how sure are you that you got this one
          right?
        </p>
        <TapScale
          options={CONFIDENCE}
          value={Number.isNaN(current) ? null : current}
          onChange={chooseConfidence}
        />
      </Stage>
    );
  }

  return (
    <Stage
      eyebrow="Predict · your overall estimate"
      question="Across all of it, how much do you think you got right?"
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
        <p className="mt-6 text-sm text-secondary">Recording your prediction…</p>
      )}
    </Stage>
  );
}
