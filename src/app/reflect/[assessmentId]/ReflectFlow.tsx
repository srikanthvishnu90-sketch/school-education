"use client";

import Link from "next/link";
import { useState, useTransition, type ReactElement } from "react";
import { recordAffect, recordReflection } from "@/app/_world/actions";
import { Dots, Primary, QuietLink, Stage } from "@/app/_ui/atoms";
import { BigChoice, type ChoiceOption } from "@/app/_ui/controls";
import type { AttributionCategory } from "@/domain";

/**
 * The reflection flow — cold, calm, task-focused. The emotional step is a single
 * OPTIONAL screen ("skip for now" is weighted equally; skipping records nothing).
 * Attribution is guided taps; a non-productive attribution is met with a gentle
 * re-ask, never a block. It closes quietly, with no celebration.
 *
 * These are reflection surfaces, so the question uses the serif voice font.
 */

type Step =
  | "emotion"
  | "category"
  | "specific"
  | "controllable"
  | "reask"
  | "commit"
  | "done";

const CATEGORIES: readonly ChoiceOption<AttributionCategory>[] = [
  { value: "strategy", label: "My approach", hint: "How I worked the problem" },
  { value: "effort_allocation", label: "How I spent my time", hint: "Where my attention went" },
  { value: "misconception", label: "A specific misunderstanding", hint: "A rule or idea I had wrong" },
  { value: "external", label: "Something around me", hint: "Conditions outside the work" },
  { value: "ability", label: "Just how I am at this", hint: "A whole-subject feeling" },
];

const CATEGORY_LABEL: Record<AttributionCategory, string> = {
  strategy: "My approach",
  effort_allocation: "How I spent my time",
  misconception: "A specific misunderstanding",
  external: "Something around me",
  ability: "How I am at this",
};

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export interface VocabTerm {
  term: string;
  valence: number;
}

export default function ReflectFlow({
  assessmentId,
  studentId,
  vocabulary,
}: {
  assessmentId: string;
  studentId: string;
  vocabulary: VocabTerm[];
}): ReactElement {
  const [step, setStep] = useState<Step>("emotion");
  const [chosenTerms, setChosenTerms] = useState<string[]>([]);
  const [category, setCategory] = useState<AttributionCategory | null>(null);
  const [specific, setSpecific] = useState<boolean | null>(null);
  const [controllable, setControllable] = useState<boolean | null>(null);
  const [actionText, setActionText] = useState("");
  const [dueBy, setDueBy] = useState(defaultDueDate());
  const [pending, startTransition] = useTransition();

  const leave = <QuietLink href="/map">Leave for now</QuietLink>;

  // --- Emotional step (optional) --------------------------------------------
  if (step === "emotion") {
    function toggle(term: string): void {
      setChosenTerms((prev) =>
        prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term],
      );
    }
    function continueWithAffect(): void {
      startTransition(async () => {
        await recordAffect({ studentId, assessmentId, terms: chosenTerms });
        setStep("category");
      });
    }
    return (
      <Stage
        eyebrow="If you want"
        question="How did seeing that feel?"
        voice
        footer={
          <div className="flex items-center justify-between">
            {leave}
            <Dots total={5} index={0} />
          </div>
        }
      >
        <p className="mb-5 text-[15px] text-secondary">
          Naming it can help — but only if you want to. There is no penalty for
          skipping, and nothing is saved unless you choose a word.
        </p>
        <div className="flex flex-wrap gap-2">
          {vocabulary.map((t) => {
            const on = chosenTerms.includes(t.term);
            return (
              <button
                key={t.term}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t.term)}
                className={`rounded-full border px-4 py-2 text-[15px] transition-colors ${
                  on
                    ? "border-ink-tint bg-ink-wash text-ink-black"
                    : "border-ink-wash bg-white text-secondary hover:border-ink-tint/50"
                }`}
              >
                {t.term}
              </button>
            );
          })}
        </div>
        {/* Skip and continue are weighted EQUALLY — neither is the loud path. */}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => setStep("category")}
            className="flex-1 rounded-control border border-ink-wash bg-white px-5 py-2.5 text-sm font-medium text-ink-black transition-colors hover:border-ink-tint/50"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={chosenTerms.length === 0 || pending}
            onClick={continueWithAffect}
            className="flex-1 rounded-control border border-ink-wash bg-white px-5 py-2.5 text-sm font-medium text-ink-black transition-colors hover:border-ink-tint/50 disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </Stage>
    );
  }

  // --- Attribution: category → specific → controllable ----------------------
  if (step === "category") {
    return (
      <Stage
        eyebrow="Reflect · the cause"
        question="What most shaped this result?"
        voice
        footer={
          <div className="flex items-center justify-between">
            {leave}
            <Dots total={5} index={1} />
          </div>
        }
      >
        <BigChoice
          options={CATEGORIES}
          value={category}
          onChange={(v) => {
            setCategory(v);
            setStep("specific");
          }}
        />
      </Stage>
    );
  }

  if (step === "specific") {
    return (
      <Stage
        eyebrow="Reflect · how narrow"
        question="Is this about this kind of problem, or the whole subject?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("category")}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={5} index={2} />
          </div>
        }
      >
        <BigChoice
          options={[
            { value: "narrow", label: "This kind of problem", hint: "Specific and workable" },
            { value: "broad", label: "The whole subject", hint: "A general feeling" },
          ]}
          value={specific === null ? null : specific ? "narrow" : "broad"}
          onChange={(v) => {
            setSpecific(v === "narrow");
            setStep("controllable");
          }}
        />
      </Stage>
    );
  }

  if (step === "controllable") {
    function choose(canChange: boolean): void {
      setControllable(canChange);
      setStep(specific === true && canChange ? "commit" : "reask");
    }
    return (
      <Stage
        eyebrow="Reflect · in your hands"
        question="Is this something you can change next time?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("specific")}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={5} index={3} />
          </div>
        }
      >
        <BigChoice
          options={[
            { value: "yes", label: "Yes, I can change it", hint: "Within my control" },
            { value: "no", label: "Not really", hint: "Outside my control" },
          ]}
          value={controllable === null ? null : controllable ? "yes" : "no"}
          onChange={(v) => choose(v === "yes")}
        />
      </Stage>
    );
  }

  // --- Gentle re-ask (never blocks exit) ------------------------------------
  if (step === "reask") {
    return (
      <Stage
        eyebrow="One more look"
        question="Let’s find a cause you can act on."
        voice
        footer={leave}
      >
        <p className="text-[15px] leading-relaxed text-secondary">
          A cause that is specific to this kind of problem and within your
          control is the one that gives you a real next step. A whole-subject or
          out-of-your-hands cause leaves nothing to try. Take another look — or
          leave this for now, no pressure.
        </p>
        <div className="mt-8">
          <Primary onClick={() => setStep("specific")}>Look again</Primary>
        </div>
      </Stage>
    );
  }

  // --- Commit: one action, one date -----------------------------------------
  if (step === "commit") {
    const note =
      category !== null
        ? `${CATEGORY_LABEL[category]}: specific to this kind of problem, within my control.`
        : "A specific, controllable cause.";
    function commit(): void {
      if (category === null || actionText.trim().length === 0) return;
      startTransition(async () => {
        await recordReflection({
          studentId,
          assessmentId,
          category: category as AttributionCategory,
          specific: true,
          controllable: true,
          note,
          actionText: actionText.trim(),
          dueByISO: dueBy,
        });
        setStep("done");
      });
    }
    return (
      <Stage
        eyebrow="Reflect · one next step"
        question="What is one thing you’ll try — and by when?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("controllable")}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={5} index={4} />
          </div>
        }
      >
        <label htmlFor="next-action" className="sr-only">
          Your next action
        </label>
        <textarea
          id="next-action"
          value={actionText}
          onChange={(e) => setActionText(e.target.value)}
          rows={3}
          placeholder="e.g. Redo the two slope questions, writing each step out."
          className="w-full rounded-control border border-ink-wash bg-white px-4 py-3 text-[15px] text-ink-black outline-none transition-colors focus:border-ink-tint"
        />
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="due-by" className="text-sm text-secondary">
            By
          </label>
          <input
            id="due-by"
            type="date"
            value={dueBy}
            onChange={(e) => setDueBy(e.target.value)}
            className="rounded-control border border-ink-wash bg-white px-3 py-2 text-sm text-ink-black outline-none focus:border-ink-tint"
          />
        </div>
        <div className="mt-8">
          <Primary
            onClick={commit}
            disabled={actionText.trim().length === 0 || pending}
          >
            Commit to this
          </Primary>
        </div>
      </Stage>
    );
  }

  // --- Done: a quiet close, no celebration ----------------------------------
  return (
    <Stage eyebrow="Done" question="That’s the cycle." voice>
      <p className="text-[15px] leading-relaxed text-secondary">
        You predicted, saw the truth, named one controllable cause, and committed
        to one step. Nothing else is asked of you now.
      </p>
      <div className="mt-8 flex items-center gap-5">
        <Primary href="/map">See your map</Primary>
        <Link
          href="/"
          className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
        >
          Home
        </Link>
      </div>
    </Stage>
  );
}
