import Link from "next/link";
import type { ReactElement } from "react";
import {
  DEFAULT_STUDENT_ID,
  SKILL_NAMES,
  getWorld,
  isKnownStudent,
} from "@/app/_world/world";
import { accuracy } from "@/domain";

/**
 * The learning map — the externalized progression the student locates themselves
 * on, and a single calm line from belief to reality for this cycle. No
 * leaderboards, no peer data, no ranking: only this student, only their own goal.
 * The trajectory is honest about being one cycle so far.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const sp = await searchParams;
  const studentId =
    typeof sp.student === "string" ? sp.student : DEFAULT_STUDENT_ID;

  const world = await getWorld();
  const known = isKnownStudent(world, studentId);
  const map = world.learningMap;
  const bands = [...map.bands].sort((a, b) => a.order - b.order);

  const prediction = known
    ? await world.repos.predictions.findByAssessmentAndStudent(
        world.assessment.id,
        studentId,
      )
    : null;
  const outcome = known
    ? await world.repos.outcomes.findByAssessmentAndStudent(
        world.assessment.id,
        studentId,
      )
    : null;

  const hasCycle = prediction !== null && outcome !== null;
  const predicted = prediction?.globalPredicted ?? null;
  const achieved = hasCycle ? (accuracy(prediction, outcome) ?? null) : null;
  const gap =
    predicted !== null && achieved !== null
      ? Math.abs(predicted - achieved)
      : null;
  const tone = gap !== null && gap > 0.15 ? "gap" : "aligned";

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

      {/* Trajectory — a single calm line from belief to reality. */}
      <div className="mt-10 rounded-card border border-ink-wash bg-white p-6">
        <p className="text-[13px] uppercase tracking-[0.16em] text-secondary">
          Belief → reality
        </p>
        {hasCycle && predicted !== null && achieved !== null ? (
          <>
            <BeliefRealityLine
              predicted={predicted}
              achieved={achieved}
              tone={tone}
            />
            <p className="mt-4 text-[14px] leading-relaxed text-secondary">
              One cycle so far. The line grows into a trajectory as you go — a
              trend is worth more than any single point.
            </p>
            {namedFeeling && (
              <p className="mt-2 text-[13px] text-secondary">
                You also named how it felt.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-[15px] text-secondary">
            No cycle yet.{" "}
            <Link
              href={`/predict/${world.assessment.id}?student=${encodeURIComponent(studentId)}`}
              className="text-ink-tint underline-offset-4 hover:underline"
            >
              Predict this assessment
            </Link>{" "}
            to draw your first line.
          </p>
        )}
      </div>
    </main>
  );
}

function BeliefRealityLine({
  predicted,
  achieved,
  tone,
}: {
  predicted: number;
  achieved: number;
  tone: "gap" | "aligned";
}): ReactElement {
  // Two points on a 0–100% vertical scale, joined by one calm segment.
  const w = 520;
  const h = 160;
  const pad = 28;
  const y = (v: number): number => pad + (1 - v) * (h - 2 * pad);
  const stroke = tone === "gap" ? "var(--color-gap)" : "var(--color-aligned)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-4 w-full"
      role="img"
      aria-label={`You predicted ${Math.round(predicted * 100)} percent; the result was ${Math.round(achieved * 100)} percent.`}
    >
      <line x1={140} y1={y(predicted)} x2={380} y2={y(achieved)} stroke={stroke} strokeWidth={2} />
      <circle cx={140} cy={y(predicted)} r={5} fill="#FFFFFF" stroke={stroke} strokeWidth={2} />
      <circle cx={380} cy={y(achieved)} r={5} fill={stroke} />
      <text x={140} y={y(predicted) - 12} textAnchor="middle" className="fill-secondary text-[11px]">
        You predicted {Math.round(predicted * 100)}%
      </text>
      <text x={380} y={y(achieved) + 22} textAnchor="middle" className="fill-secondary text-[11px]">
        Result {Math.round(achieved * 100)}%
      </text>
    </svg>
  );
}
