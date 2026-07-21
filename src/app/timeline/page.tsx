import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import {
  getStudentTimeline,
  type TimelineEntry,
} from "@/app/_world/timelineActions";
import EraseButton from "./EraseButton";
import type {
  MetacognitiveAlignment,
  TrendDirection,
} from "@/domain/intelligence/metacognition";

/**
 * The student's longitudinal view: each reflection set beside its graded result,
 * and whether their sense of their own work is getting closer to the truth over
 * time. Task-focused, never a trait or a red/green verdict — a gap reads warm,
 * a match reads ink.
 */

const ALIGNMENT_COPY: Record<MetacognitiveAlignment, string> = {
  aligned: "How sure you felt matched the result",
  confidence_ahead_of_result: "You felt surer than the result showed",
  result_ahead_of_confidence: "You did better than you felt you would",
};

const TREND_COPY: Record<TrendDirection, string> = {
  converging: "How sure you feel and your results are getting closer.",
  diverging: "How sure you feel and your results have been drifting apart.",
  steady: "How sure you feel about your work has held steady.",
  insufficient: "One more reflection and a trend starts to show.",
};

export default async function TimelinePage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const { entries, trend } = await getStudentTimeline();

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link
        href="/courses"
        className="inline-flex min-h-11 items-center text-sm font-medium text-ink-tint underline-offset-4 hover:underline focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-tint focus-visible:ring-offset-2 active:text-ink"
      >
        Back to courses
      </Link>
      <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        Your reflections over time
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
        How sure you felt, next to your results
      </h1>

      {entries.length === 0 ? (
        <p className="mt-6 text-[15px] leading-relaxed text-secondary">
          Once a reflection has a graded result, it shows up here beside how sure you
          felt — so you can see, over time, how well you know your own work.
        </p>
      ) : (
        <>
          <p className="mt-4 rounded-card border border-ink-wash bg-ink-wash/60 px-4 py-3 text-[15px] leading-relaxed text-ink-black">
            {TREND_COPY[trend]}
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {entries.map((e) => (
              <TimelineRow key={e.reflectionId} entry={e} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-12 border-t border-ink-wash pt-6">
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-secondary">
          Your data
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          Your reflections are yours. You can delete them whenever you want.
        </p>
        <div className="mt-3">
          <EraseButton />
        </div>
      </div>
    </main>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }): ReactElement {
  const matched = entry.alignment === "aligned";
  return (
    <li className="rounded-card border border-ink-wash bg-white p-5">
      <p className="text-[15px] font-medium text-ink-black">{entry.title}</p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
        <span className="text-secondary">
          Result{" "}
          <span className="font-medium text-ink-black">{entry.scorePercent}%</span>
        </span>
        <span className="text-secondary">
          How sure you felt{" "}
          <span className="font-medium text-ink-black">
            {entry.selfConfidencePercent === null
              ? "—"
              : `${entry.selfConfidencePercent}%`}
          </span>
        </span>
      </div>
      {entry.alignment !== null ? (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={
              matched
                ? "inline-block h-2 w-2 rounded-full bg-ink-tint"
                : "inline-block h-2 w-2 rounded-full bg-warm"
            }
            aria-hidden
          />
          <span className="text-[14px] text-ink-black">
            {ALIGNMENT_COPY[entry.alignment]}
          </span>
        </div>
      ) : null}
    </li>
  );
}
