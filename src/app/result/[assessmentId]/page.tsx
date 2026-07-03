import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { Primary, Stage } from "@/app/_ui/atoms";
import { getSessionStudent } from "@/app/_world/session";
import { calibrationStatement } from "@/app/_world/statement";
import {
  DEMO_ASSESSMENT_ID,
  SKILL_NAMES,
  getWorld,
  isKnownStudent,
} from "@/app/_world/world";
import { accuracy, perSkill, type SkillCalibration } from "@/domain";

/**
 * Result — EVIDENCE first (the score against the student's OWN goal), then one
 * calibration statement in task language. Alignment is ink-tint, a gap is the
 * warm accent; red/green never encode accuracy, and there is no exclamation.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}): Promise<ReactElement> {
  const { assessmentId } = await params;
  const studentId = await getSessionStudent();
  if (studentId === null) redirect("/signin");

  const world = await getWorld();
  if (assessmentId !== DEMO_ASSESSMENT_ID || !isKnownStudent(world, studentId)) {
    notFound();
  }

  const prediction = await world.repos.predictions.findByAssessmentAndStudent(
    assessmentId,
    studentId,
  );
  const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
    assessmentId,
    studentId,
  );
  if (prediction === null || outcome === null) {
    redirect(`/predict/${assessmentId}?student=${encodeURIComponent(studentId)}`);
  }

  const correct = outcome.itemOutcomes.filter((o) => o.correct).length;
  const total = outcome.itemOutcomes.length;
  const achieved = accuracy(prediction, outcome) ?? 0;
  const goal = (await world.repos.goals.listByStudent(studentId))
    .filter((g) => g.assessmentId === assessmentId)
    .at(-1);
  const target = goal?.targetScore ?? null;

  const bySkill = perSkill(prediction, outcome, world.assessment.items);
  const widest = bySkill.reduce<SkillCalibration | null>((worst, s) => {
    if (s.bias === null) return worst;
    if (worst === null || Math.abs(s.bias) > Math.abs(worst.bias ?? 0)) return s;
    return worst;
  }, null);

  const statement =
    widest !== null
      ? calibrationStatement({
          skillName: SKILL_NAMES[widest.skillId] ?? widest.skillId,
          bias: widest.bias ?? 0,
        })
      : null;

  const reflectHref = `/reflect/${assessmentId}`;

  return (
    <Stage
      eyebrow="What really happened"
      footer={<Primary href={reflectHref}>Think about it</Primary>}
    >
      {/* Evidence first — the score against the student's own goal. */}
      <div className="rounded-card border border-ink-wash bg-white p-6">
        <p className="text-[13px] uppercase tracking-[0.16em] text-secondary">
          What happened
        </p>
        <p className="mt-3 text-3xl font-medium tracking-tight text-ink-black">
          You got {correct} out of {total}
        </p>
        {target !== null && (
          <p className="mt-2 text-[15px] text-secondary">
            You hoped for {Math.round(target * 100)}%. You got{" "}
            {Math.round(achieved * 100)}%.
          </p>
        )}
      </div>

      {/* The one calibration statement, in plain task language. */}
      {statement !== null && (
        <div className="mt-5 flex gap-4 rounded-card border border-ink-wash bg-white p-6">
          <span
            aria-hidden
            className="mt-1 block h-full w-1 shrink-0 self-stretch rounded-full"
            style={{
              backgroundColor:
                statement.tone === "gap" ? "var(--color-gap)" : "var(--color-aligned)",
            }}
          />
          <div>
            <p className="text-[13px] uppercase tracking-[0.16em] text-secondary">
              {statement.tone === "gap" ? "A gap" : "Lined up"}
            </p>
            <p className="mt-2 text-[17px] leading-relaxed text-ink-black">
              {statement.text}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-secondary">
              This is about the work, not about you. Next, you&rsquo;ll say why —
              in your own words — and pick one small thing to try.
            </p>
          </div>
        </div>
      )}
    </Stage>
  );
}
