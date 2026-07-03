import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionStudent } from "@/app/_world/session";
import { SKILL_NAMES, getWorld, isKnownStudent } from "@/app/_world/world";
import { accuracy } from "@/domain";

/**
 * The learning map — the externalized progression the student locates themselves
 * on, and the honest belief↔reality trajectory across their cycles. No
 * leaderboards, no peer data, no ranking: only this student, only their own goal.
 * When a next check is available and unstarted, it invites the RETURN — the single
 * behavior the pilot exists to measure. The trajectory grows one honest line per
 * completed cycle.
 */

interface CyclePoint {
  cycleN: number;
  predicted: number;
  achieved: number;
}

export default async function MapPage(): Promise<ReactElement> {
  const studentId = await getSessionStudent();
  if (studentId === null) redirect("/signin");

  const world = await getWorld();
  const known = isKnownStudent(world, studentId);
  const map = world.learningMap;
  const bands = [...map.bands].sort((a, b) => a.order - b.order);

  // Every completed cycle, in order — a belief↔reality point each.
  const points: CyclePoint[] = [];
  let nextUnstarted: { id: string; cycleN: number } | null = null;
  if (known) {
    for (let i = 0; i < world.assessments.length; i += 1) {
      const a = world.assessments[i];
      const prediction = await world.repos.predictions.findByAssessmentAndStudent(
        a.id,
        studentId,
      );
      const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
        a.id,
        studentId,
      );
      if (prediction !== null && outcome !== null) {
        points.push({
          cycleN: i + 1,
          predicted: prediction.globalPredicted,
          achieved: accuracy(prediction, outcome) ?? 0,
        });
      } else if (nextUnstarted === null) {
        nextUnstarted = { id: a.id, cycleN: i + 1 };
      }
    }
  }

  const namedFeeling =
    known &&
    (await world.repos.affects.listByStudent(studentId)).some(
      (a) => a.phase === "post_evidence",
    );

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        Your learning map
      </p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight text-ink-black">
        {SKILL_NAMES[map.skillId] ?? "Your skill"}
      </h1>

      {/* Bands — where the student is on the progression. */}
      <div className="mt-10 space-y-px overflow-hidden rounded-card border border-ink-wash">
        {bands.map((band) => {
          const here = band.id === map.currentBandId;
          return (
            <div
              key={band.id}
              className={`flex items-baseline gap-4 p-5 ${
                here ? "bg-ink-wash" : "bg-white"
              }`}
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  here ? "bg-ink-tint" : "bg-ink-wash ring-1 ring-inset ring-secondary/30"
                }`}
              />
              <div>
                <p className="text-[15px] font-medium text-ink-black">
                  {band.label}
                  {here && (
                    <span className="ml-2 text-[12px] font-normal uppercase tracking-[0.16em] text-ink-tint">
                      You are here
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-secondary">
                  {band.descriptor}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trajectory — one honest line per completed cycle. */}
      <div className="mt-10 rounded-card border border-ink-wash bg-white p-6">
        <p className="text-[13px] uppercase tracking-[0.16em] text-secondary">
          Your guess vs. what really happened
        </p>
        {points.length > 0 ? (
          <>
            <Trajectory points={points} />
            <p className="mt-4 text-[14px] leading-relaxed text-secondary">
              {points.length === 1
                ? "Just one time so far. The line grows as you do more. One time doesn’t say much — the pattern does."
                : "Two lines: your guess and what really happened. Watch whether they move closer over time — that closeness is the whole point."}
            </p>
            {namedFeeling && (
              <p className="mt-2 text-[13px] text-secondary">
                You also said how it felt.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-[15px] text-secondary">
            Nothing here yet.{" "}
            <Link
              href={`/predict/${world.assessments[0].id}`}
              className="text-ink-tint underline-offset-4 hover:underline"
            >
              Make a guess
            </Link>{" "}
            to draw your first line.
          </p>
        )}
      </div>

      {/* The return invitation — the behavior the pilot measures. */}
      {nextUnstarted !== null && points.length > 0 && (
        <div className="mt-5 flex items-center justify-between rounded-card border border-ink-wash bg-paper p-6">
          <div>
            <p className="text-[15px] font-medium text-ink-black">
              Ready for your next check?
            </p>
            <p className="mt-1 text-[14px] text-secondary">
              A fresh set of questions. See if your guess lands closer this time.
            </p>
          </div>
          <Link
            href={`/predict/${nextUnstarted.id}`}
            className="shrink-0 rounded-control bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-tint"
          >
            Start check {nextUnstarted.cycleN}
          </Link>
        </div>
      )}
    </main>
  );
}

/**
 * Two polylines across the cycles — the guess (open) and the reality (filled) —
 * with each cycle's gap drawn as the segment between them, tinted by tone. Never
 * red/green: alignment is ink-tint, a gap is the warm accent.
 */
function Trajectory({ points }: { points: CyclePoint[] }): ReactElement {
  const w = 520;
  const h = 180;
  const pad = 34;
  const y = (v: number): number => pad + (1 - v) * (h - 2 * pad);
  const x = (i: number): number =>
    points.length === 1
      ? w / 2
      : pad + 40 + (i * (w - 2 * pad - 80)) / (points.length - 1);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" role="img" aria-label="Your guess versus what really happened, across your checks.">
      {/* Per-cycle gap segments, tinted by tone. */}
      {points.map((p, i) => {
        const tone = Math.abs(p.predicted - p.achieved) > 0.15 ? "gap" : "aligned";
        const stroke = tone === "gap" ? "var(--color-gap)" : "var(--color-aligned)";
        return (
          <line
            key={`gap-${p.cycleN}`}
            x1={x(i)}
            y1={y(p.predicted)}
            x2={x(i)}
            y2={y(p.achieved)}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      })}
      {/* The reality trajectory (filled) — faint connecting line. */}
      {points.length > 1 && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.achieved)}`).join(" ")}
          fill="none"
          stroke="var(--color-aligned)"
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}
      {points.map((p, i) => (
        <g key={`pt-${p.cycleN}`}>
          <circle cx={x(i)} cy={y(p.predicted)} r={4.5} fill="#FFFFFF" stroke="var(--color-secondary)" strokeWidth={2} />
          <circle cx={x(i)} cy={y(p.achieved)} r={4.5} fill="var(--color-aligned)" />
          <text x={x(i)} y={h - 10} textAnchor="middle" className="fill-secondary text-[10px]">
            Check {p.cycleN}
          </text>
        </g>
      ))}
      <text x={pad - 6} y={y(0.95)} className="fill-secondary text-[10px]">
        guess ○ · real ●
      </text>
    </svg>
  );
}
