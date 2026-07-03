import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { Primary, Stage } from "@/app/_ui/atoms";
import { calibrationStatement } from "@/app/_world/statement";
import {
  DEFAULT_STUDENT_ID,
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
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { assessmentId } = await params;
  const sp = await searchParams;
  const studentId =
    typeof sp.student === "string" ? sp.student : DEFAULT_STUDENT_ID;

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

  const reflectHref = `/reflect/${assessmentId}?student=${encodeURIComponent(studentId)}`;

  return (
    <Stage
      eyebrow="Where you really are"
      footer={<Primary href={reflectHref}>Reflect on this</Primary>}
    >
      {/* Evidence first — the score against the student's own goal. */}
      <div className="rounded-card border border-ink-wash bg-white p-6">
        <p className="text-[13px] uppercase tracking-[0.16em] text-secondary">
          The evidence
        </p>
        <p className="mt-3 text-3xl font-medium tracking-tight text-ink-black">
          {correct} of {total} correct
        </p>
        {target !== null && (
          <p className="mt-2 text-[15px] text-secondary">
            Your goal was {Math.round(target * 100)}%. The result is{" "}
            {Math.round(achieved * 100)}%.
          </p>
        )}
      </div>

      {/* The one calibration statement, in task language. */}
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
              {statement.tone === "gap" ? "A gap to close" : "In alignment"}
            </p>
            <p className="mt-2 text-[17px] leading-relaxed text-ink-black">
              {statement.text}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-secondary">
              This is about the work on the page, not about you. Next, you&rsquo;ll
              name one controllable cause and one thing to try.
            </p>
          </div>
        </div>
      )}
    </Stage>
  );
}
