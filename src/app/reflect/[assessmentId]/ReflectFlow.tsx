"use client";

import Link from "next/link";
import { useState, useTransition, type ReactElement } from "react";
import { recordAffect, recordReflection } from "@/app/_world/actions";
import { screenReflectionText } from "@/app/_world/safetyActions";
import { assessDepth } from "@/app/_world/depth";
import { Dots, Primary, QuietLink, Stage } from "@/app/_ui/atoms";
import { BigChoice, type ChoiceOption } from "@/app/_ui/controls";
import type { AttributionCategory, ReflectionProbe } from "@/domain";
import CrisisResources from "./CrisisResources";

/**
 * The self-reflection flow — plumb is an emotional AND academic AWARENESS
 * instrument, so every step here is FREE RESPONSE and detailed. After an optional
 * feeling, the student walks their own thinking item by item: what happened on
 * each question they missed, where the reasoning first diverged per skill, and
 * what they understand differently now. Those questions are FORMULATED upstream
 * from the teacher's exam items; this surface only presents and depth-gates them.
 *
 * It stays cold and calm, the words are simple, and an under-answered box is met
 * with a gentle re-ask, never a block. Reflection surfaces use the serif voice.
 */

type Step = "emotion" | "probes" | "cause" | "fixable" | "reask" | "commit" | "done";

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
  probes,
  truncated,
}: {
  assessmentId: string;
  vocabulary: VocabTerm[];
  probes: ReflectionProbe[];
  truncated: boolean;
}): ReactElement {
  const [step, setStep] = useState<Step>("emotion");
  const [chosenTerms, setChosenTerms] = useState<string[]>([]);
  const [probeIndex, setProbeIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => probes.map(() => ""));
  const [cause, setCause] = useState<AttributionCategory | null>(null);
  const [actionText, setActionText] = useState("");
  const [dueBy, setDueBy] = useState(defaultDueDate());
  const [crisis, setCrisis] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = probes.length + 4; // emotion + probes + cause + fixable + commit
  const leave = <QuietLink href="/map">Leave for now</QuietLink>;

  // Safety screening runs at every free-text capture boundary (P16). On a hit,
  // the calm resource screen takes over; `onSafe` is the normal advance.
  function screenThen(text: string, onSafe: () => void): void {
    startTransition(async () => {
      const { crisis: hit } = await screenReflectionText(text);
      if (hit) setCrisis(true);
      else onSafe();
    });
  }

  // The crisis resource moment takes over everything else while shown.
  if (crisis) {
    return <CrisisResources onExit={() => setCrisis(false)} />;
  }

  function setAnswer(value: string): void {
    setAnswers((prev) => prev.map((a, i) => (i === probeIndex ? value : a)));
  }

  // The reflection note is the student's own reconstruction, in their words.
  function combinedNote(): string {
    return probes
      .map((p, i) => `${p.question}\n${answers[i].trim()}`)
      .filter((_, i) => answers[i].trim().length > 0)
      .join("\n\n");
  }

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
        setStep("probes");
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
            <Dots total={total} index={0} />
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
            onClick={() => setStep("probes")}
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

  // --- The detailed, free-response probe walk --------------------------------
  if (step === "probes") {
    const probe = probes[probeIndex];
    const answer = answers[probeIndex] ?? "";
    const depth = assessDepth(answer, {
      minWords: probe.minWords,
      minChars: probe.minWords * 4,
    });
    const isFirst = probeIndex === 0;
    const isLast = probeIndex === probes.length - 1;

    const eyebrow =
      probe.kind === "what_happened"
        ? "What happened"
        : probe.kind === "why_wrong"
          ? "Where it turned"
          : "What changed";

    function back(): void {
      if (isFirst) setStep("emotion");
      else setProbeIndex((i) => i - 1);
    }
    function next(): void {
      // Crisis screening happens on blur (a capture boundary that isn't gated by
      // the depth rule); advancing here stays synchronous. If the blur screen
      // detects a crisis, `setCrisis` takes over regardless of the step.
      if (isLast) setStep("cause");
      else setProbeIndex((i) => i + 1);
    }

    return (
      <Stage
        eyebrow={eyebrow}
        question={probe.question}
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={total} index={1 + probeIndex} />
          </div>
        }
      >
        <p className="mb-4 text-[15px] text-secondary">
          Take your time. Use your own words — the small, honest details are what
          matter here.
          {isFirst && truncated
            ? " We’ll look at a few of them closely, not every single one."
            : ""}
        </p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onBlur={() => screenThen(answer, () => {})}
          rows={5}
          aria-label={probe.question}
          placeholder="When I read it, I first…"
          className="w-full rounded-control border border-ink-wash bg-white px-4 py-3 text-[15px] leading-relaxed text-ink-black outline-none transition-colors focus:border-ink-tint"
        />
        <div className="mt-3 min-h-[20px] text-[13px] text-secondary">
          {depth.hint}
        </div>
        <div className="mt-6">
          <Primary onClick={next} disabled={!depth.ok}>
            {isLast ? "Name the reason" : "Next"}
          </Primary>
        </div>
      </Stage>
    );
  }

  // --- Cause (simple pick, informed by what they just wrote) -----------------
  if (step === "cause") {
    return (
      <Stage
        eyebrow="The reason"
        question="Putting that together — what mostly made this happen?"
        voice
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setProbeIndex(probes.length - 1);
                setStep("probes");
              }}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={total} index={1 + probes.length} />
          </div>
        }
      >
        <BigChoice
          options={CAUSES}
          value={cause}
          onChange={(v) => {
            setCause(v);
            setStep("fixable");
          }}
        />
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
              onClick={() => setStep("cause")}
              className="text-sm text-secondary underline-offset-4 hover:text-ink-tint hover:underline"
            >
              Back
            </button>
            <Dots total={total} index={2 + probes.length} />
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
          <Primary onClick={() => setStep("cause")}>Look again</Primary>
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
        // Screen the full reflection text at this final capture boundary (P16).
        const { crisis: hit } = await screenReflectionText(
          `${combinedNote()}\n${actionText}`,
        );
        if (hit) {
          setCrisis(true);
          return;
        }
        await recordReflection({
          assessmentId,
          category: cause as AttributionCategory,
          specific: true,
          controllable: true,
          note: combinedNote() || actionText.trim(),
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
            <Dots total={total} index={3 + probes.length} />
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
        You made a guess, you saw what really happened, you walked back through
        your own thinking in your own words, and you picked one small thing to
        try. Nothing else to do right now.
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
