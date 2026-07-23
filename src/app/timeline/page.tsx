import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import {
  getStudentTimeline,
  type StudentProbe,
  type TimelineEntry,
} from "@/app/_world/timelineActions";
import EraseButton from "./EraseButton";
import type {
  MetacognitiveAlignment,
  TrendDirection,
} from "@/domain/intelligence/metacognition";
import type { StudentSkillCalibration } from "@/domain/intelligence/skillCalibrationView";
import type {
  ProbeMovementDirection,
  ProbeSelfScore,
} from "@/domain/intelligence/probeAttempt";

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

/** Per-skill trajectory, phrased about the work on that one skill — never a trait. */
const SKILL_TREND_COPY: Record<TrendDirection, string> = {
  converging: "Your sense of this skill is getting closer to your work.",
  diverging: "Your sense of this skill has been drifting from your work.",
  steady: "Your sense of this skill has held steady.",
  insufficient: "One more graded reflection on this skill and a trend shows.",
};

/**
 * The one-line read on the student's own from-memory checks — calm, task-focused, about
 * the work sticking, never about the student. Private to them.
 */
const PROBE_MOVEMENT_COPY: Record<ProbeMovementDirection, string> = {
  improving: "When you test yourself from memory, more of it is sticking.",
  steady: "You've been holding steady when you test yourself.",
  mixed: "Some stuck, some didn't — that's what the next step is for.",
  insufficient:
    "Do one more from-memory check and your own trend starts to show.",
};

/** Neutral labels for a self-score — a three-way self-comparison, never a green/red verdict. */
const PROBE_SCORE_COPY: Record<ProbeSelfScore, string> = {
  got_it: "Got it",
  partly: "Partly",
  not_yet: "Not yet",
};

/** A calm, fixed date for a private practice record — no locale surprises on the server. */
function formatProbeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Within this band the latest gap counts as a match; outside it, a gap reads warm. */
const SKILL_GAP_EPS = 0.1;

/** The latest gap on a skill, phrased about the work — never a number-as-verdict. */
function skillGapCopy(latestDelta: number | null): string | null {
  if (latestDelta === null) return null;
  if (Math.abs(latestDelta) <= SKILL_GAP_EPS) return "Your sense matched your work here.";
  return latestDelta > 0
    ? "You felt surer than your work showed here."
    : "You did better than you felt here.";
}

export default async function TimelinePage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const { entries, trend, skills, probes, movement } =
    await getStudentTimeline();

  // The student's chosen next step lives on the reflection; read it back beside the
  // matching from-memory check — the feed-forward finally being closed on their timeline.
  const actionByReflection = new Map<string, string | undefined>(
    entries.map((e) => [e.reflectionId, e.selectedAction]),
  );

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
          Each reflection you finish shows up here, with the next step you chose. Once
          it has a graded result, you also see how sure you felt beside how it went —
          so you can watch, over time, how well you know your own work.
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

      {probes.length > 0 ? (
        <section className="mt-12 border-t border-ink-wash pt-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-secondary">
            What you can do now — just for you
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink-black">
            Your from-memory checks
          </h2>
          <p className="mt-4 rounded-card border border-ink-wash bg-ink-wash/60 px-4 py-3 text-[15px] leading-relaxed text-ink-black">
            {PROBE_MOVEMENT_COPY[movement.direction]}
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {probes.map((p, i) => (
              <ProbeRow
                key={`${p.reflectionId}-${p.attemptedAt}-${i}`}
                probe={p}
                nextStep={actionByReflection.get(p.reflectionId)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section className="mt-12 border-t border-ink-wash pt-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-secondary">
            By skill
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink-black">
            How your sense has tracked each skill
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {skills.map((s) => (
              <SkillRow key={s.skillId} skill={s} />
            ))}
          </ul>
        </section>
      ) : null}

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
  const graded = entry.scorePercent !== null;
  return (
    <li className="rounded-card border border-ink-wash bg-white p-5">
      <p className="text-[15px] font-medium text-ink-black">{entry.title}</p>
      {entry.selectedAction !== undefined && entry.selectedAction !== "" ? (
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          You chose to try:{" "}
          <span className="text-ink-black">{entry.selectedAction}</span>
        </p>
      ) : null}
      {graded ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
            <span className="text-secondary">
              Result{" "}
              <span className="font-medium text-ink-black">
                {entry.scorePercent}%
              </span>
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
        </>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-secondary">
          Waiting on your teacher&rsquo;s score.
        </p>
      )}
    </li>
  );
}

/**
 * One skill on the timeline: its label, how the student's sense of it has tracked
 * their work over time, and the latest gap phrased about the work. A match reads in
 * ink-tint; a gap carries the warm accent (the dot only) — never red/green, never a
 * number as a verdict.
 */
function SkillRow({ skill }: { skill: StudentSkillCalibration }): ReactElement {
  const gapCopy = skillGapCopy(skill.latestDelta);
  const aligned =
    skill.latestDelta === null || Math.abs(skill.latestDelta) <= SKILL_GAP_EPS;
  return (
    <li className="rounded-card border border-ink-wash bg-white p-5">
      <p className="text-[15px] font-medium text-ink-black">{skill.label}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-secondary">
        {SKILL_TREND_COPY[skill.direction]}
      </p>
      {gapCopy !== null ? (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={
              aligned
                ? "inline-block h-2 w-2 rounded-full bg-ink-tint"
                : "inline-block h-2 w-2 rounded-full bg-warm"
            }
            aria-hidden
          />
          <span className="text-[14px] text-ink-black">{gapCopy}</span>
        </div>
      ) : null}
    </li>
  );
}

/**
 * One of the student's own from-memory checks, read back to them: the lesson, a NEUTRAL
 * self-score chip (never green/red — a self-comparison, not a verdict), the date, and —
 * when they named one — the next step they chose, finally read back. This is a private
 * practice record, not a report; nothing here flows to a teacher.
 */
function ProbeRow({
  probe,
  nextStep,
}: {
  probe: StudentProbe;
  nextStep: string | undefined;
}): ReactElement {
  return (
    <li className="rounded-card border border-ink-wash bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[15px] font-medium text-ink-black">
          {probe.lessonTitle}
        </p>
        <span className="shrink-0 rounded-control border border-ink-wash bg-paper px-2 py-0.5 text-[13px] font-medium text-ink-tint">
          {PROBE_SCORE_COPY[probe.selfScore]}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-secondary">
        {formatProbeDate(probe.attemptedAt)}
      </p>
      {nextStep !== undefined && nextStep !== "" ? (
        <p className="mt-3 text-[14px] leading-relaxed text-secondary">
          You chose to try:{" "}
          <span className="text-ink-black">{nextStep}</span>
        </p>
      ) : null}
    </li>
  );
}
