"use client";

import Link from "next/link";
import { useState, useTransition, type ReactElement } from "react";
import { recordAffect, recordReflection } from "@/app/_world/actions";
import { assessDepth } from "@/app/_world/depth";
import { Dots, Primary, QuietLink, Stage } from "@/app/_ui/atoms";
import { BigChoice, type ChoiceOption } from "@/app/_ui/controls";
import type { AttributionCategory } from "@/domain";

/**
 * The self-awareness questionnaire — short, plain questions that ask for real,
 * free-written answers. It is cold and calm, the words are simple enough for a
 * young reader, and a made-up cause is met with a gentle re-ask, never a block.
 * A free answer must be a REAL answer (the depth gate) before it moves on.
 *
 * Reflection surfaces use the serif voice font.
 */

type Step = "emotion" | "cause" | "why" | "fixable" | "reask" | "commit" | "done";

const CAUSES: readonly ChoiceOption<AttributionCategory>[] = [
  { value: "strategy", label: "The way I did it", hint: "My plan or my steps" },
  { value: "effort_allocation", label: "My time", hint: "How much time I gave it" },
  { value: "misconception", label: "A mix-up", hint: "I had something wrong in my head" },
  { value: "external", label: "Something around me", hint: "Not the work itself" },
  { value: "ability", label: "Just me", hint: "I feel like I'm just like this" },
];

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
  vocabulary,
}: {
  assessmentId: string;
  vocabulary: VocabTerm[];
}): ReactElement {
  const [step, setStep] = useState<Step>("emotion");
  const [chosenTerms, setChosenTerms] = useState<string[]>([]);
  const [cause, setCause] = useState<AttributionCategory | null>(null);
  const [why, setWhy] = useState("");
  const [actionText, setActionText] = useState("");
  const [dueBy, setDueBy] = useState(defaultDueDate());
  const [pending, startTransition] = useTransition();

  const leave = <QuietLink href="/map">Leave for now</QuietLink>;

  // --- Optional feeling step -------------------------------------------------
  if (step === "emotion") {
    function toggle(term: string): void {
      setChosenTerms((prev) =>
        prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term],
      );
    }
    function keepGoing(): void {
      startTransition(async () => {
        await recordAffect({ assessmentId, terms: chosenTerms });
        setStep("cause");
      });
    }
    return (
      <Stage
        eyebrow="Only if you want"
        question="How do you feel now?"
        voice
        footer={
          <div className="flex items-center justify-between">
            {leave}
            <Dots total={5} index={0} />
          </div>
        }
      >
        <p className="mb-5 text-[15px] text-secondary">
          You can pick a word. Or don&rsquo;t — that&rsquo;s okay too. Nothing is
          saved unless you pick one.
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
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => setStep("cause")}
            className="flex-1 rounded-control border border-ink-wash bg-white px-5 py-2.5 text-sm font-medium text-ink-black transition-colors hover:border-ink-tint/50"
          >
            Skip this
          </button>
          <button
            type="button"
            disabled={chosenTerms.length === 0 || pending}
            onClick={keepGoing}
            className="flex-1 rounded-control border border-ink-wash bg-white px-5 py-2.5 text-sm font-medium text-ink-black transition-colors hover:border-ink-tint/50 disabled:opacity-40"
          >
            Keep going
          </button>
        </div>
      </Stage>
    );
  }

  // --- Cause (simple pick) ---------------------------------------------------
  if (step === "cause") {
    return (
      <Stage
        eyebrow="The reason"
        question="What made this happen?"
        voice
        footer={
          <div className="flex items-center justify-between">
            {leave}
            <Dots total={5} index={1} />
          </div>
        }
      >
        <BigChoice
          options={CAUSES}
          value={cause}
          onChange={(v) => {
            setCause(v);
            setStep("why");
          }}
        />
      </Stage>
    );
  }

  // --- Why (free answer, must be real) ---------------------------------------
  if (step === "why") {
    const depth = assessDepth(why);
    return (
      <Stage
        eyebrow="In your words"
        question="Tell me more. Why do you think it went this way?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("cause")}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={5} index={2} />
          </div>
        }
      >
        <p className="mb-4 text-[15px] text-secondary">
          Use your own words. Even a small, honest reason is good.
        </p>
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          rows={4}
          aria-label="Why do you think it went this way?"
          placeholder="I thought I had it, but…"
          className="w-full rounded-control border border-ink-wash bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-black outline-none transition-colors focus:border-ink-tint"
        />
        <div className="mt-3 min-h-[20px] text-[13px] text-secondary">
          {depth.hint}
        </div>
        <div className="mt-6">
          <Primary onClick={() => setStep("fixable")} disabled={!depth.ok}>
            Next
          </Primary>
        </div>
      </Stage>
    );
  }

  // --- Fixable? (collapses specific + controllable into one plain question) --
  if (step === "fixable") {
    function choose(canFix: boolean): void {
      setStep(canFix ? "commit" : "reask");
    }
    return (
      <Stage
        eyebrow="Next time"
        question="Can you fix this next time — just for this kind of question?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("why")}
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
            { value: "yes", label: "Yes, I can", hint: "Something I can change" },
            { value: "no", label: "Not really", hint: "It felt out of my hands" },
          ]}
          value={null}
          onChange={(v) => choose(v === "yes")}
        />
      </Stage>
    );
  }

  // --- Gentle re-ask (never blocks the way out) ------------------------------
  if (step === "reask") {
    return (
      <Stage
        eyebrow="One more look"
        question="Let’s find something you can change."
        voice
        footer={leave}
      >
        <p className="text-[15px] leading-relaxed text-secondary">
          A small thing you can do — just for this kind of question — gives you a
          real next step. If it feels too big or out of your hands, there is
          nothing to try. Take another look, or stop here. Either is okay.
        </p>
        <div className="mt-8">
          <Primary onClick={() => setStep("why")}>Look again</Primary>
        </div>
      </Stage>
    );
  }

  // --- One small next step (free answer, must be real) -----------------------
  if (step === "commit") {
    const depth = assessDepth(actionText);
    function commit(): void {
      if (cause === null || !depth.ok) return;
      startTransition(async () => {
        await recordReflection({
          assessmentId,
          category: cause as AttributionCategory,
          specific: true,
          controllable: true,
          note: why.trim(),
          actionText: actionText.trim(),
          dueByISO: dueBy,
        });
        setStep("done");
      });
    }
    return (
      <Stage
        eyebrow="One small step"
        question="What is one small thing you will try?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("fixable")}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={5} index={4} />
          </div>
        }
      >
        <p className="mb-4 text-[15px] text-secondary">
          Keep it small. Say what you will do and when.
        </p>
        <label htmlFor="next-action" className="sr-only">
          What is one small thing you will try?
        </label>
        <textarea
          id="next-action"
          value={actionText}
          onChange={(e) => setActionText(e.target.value)}
          rows={3}
          placeholder="Next time I will…"
          className="w-full rounded-control border border-ink-wash bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-black outline-none transition-colors focus:border-ink-tint"
        />
        <div className="mt-3 min-h-[20px] text-[13px] text-secondary">
          {depth.hint}
        </div>
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
          <Primary onClick={commit} disabled={!depth.ok || pending}>
            This is my plan
          </Primary>
        </div>
      </Stage>
    );
  }

  // --- Quiet close -----------------------------------------------------------
  return (
    <Stage eyebrow="All done" question="That’s it for now." voice>
      <p className="text-[15px] leading-relaxed text-secondary">
        You made a guess, you saw what really happened, you found the real reason
        in your own words, and you picked one small thing to try. Nothing else to
        do right now.
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
