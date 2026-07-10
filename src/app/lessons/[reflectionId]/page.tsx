import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { buildClassBrief } from "@/app/_world/teacherReflectionActions";
import { studentDisplayName } from "@/app/_world/teacher";
import type { AttentionGroup } from "@/domain/intelligence/insight";

/**
 * The class brief for one reflection: what the class understood, how it felt, what
 * it did, the one relationship between those, and a short plan. Attention groups
 * name WHO to check on and WHY, in observed language — never a diagnosis, never a
 * ranking. Alignment reads in ink; a group needing attention carries the warm
 * accent, never red.
 */

const GROUP_LABELS: Record<AttentionGroup, string> = {
  low_understanding_low_confidence: "Struggling and knows it",
  high_understanding_low_confidence: "Doing well but doubts it",
  low_understanding_high_confidence: "Confident past the evidence",
  significant_emotional_change: "A notable shift in how it felt",
  reflection_assessment_mismatch: "Reflection and work don't line up",
  repeated_help_avoidance: "Held back from asking for help",
  positive_improvement: "Clear step forward",
};

/** Groups that are good news read in ink; the rest carry the warm attention accent. */
const POSITIVE_GROUPS: ReadonlySet<AttentionGroup> = new Set<AttentionGroup>([
  "positive_improvement",
  "high_understanding_low_confidence",
]);

export default async function ClassBriefPage({
  params,
}: {
  params: Promise<{ reflectionId: string }>;
}): Promise<ReactElement> {
  const { reflectionId } = await params;
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") redirect("/signin");

  const view = await buildClassBrief(reflectionId);

  if (view === null) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-14">
        <BackLink />
        <h1 className="mt-6 text-2xl font-medium tracking-tight text-ink-black">
          No reflections yet
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-secondary">
          The brief appears once at least one student has finished reflecting on this
          lesson. Check back after class.
        </p>
      </main>
    );
  }

  const { brief, students } = view;
  const byGroup = new Map<AttentionGroup, string[]>();
  for (const s of brief.attentionStudents) {
    const names = byGroup.get(s.group) ?? [];
    names.push(studentDisplayName(s.studentId));
    byGroup.set(s.group, names);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <BackLink />
      <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        Class brief · {students.length} reflection{students.length === 1 ? "" : "s"}
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
        Where the class landed
      </h1>

      <div className="mt-8 flex flex-col gap-4">
        <Panel label="Understanding">{brief.technicalSummary}</Panel>
        <Panel label="How it felt">{brief.emotionalSummary}</Panel>
        <Panel label="What they did">{brief.behavioralSummary}</Panel>
        <Panel label="The connection">{brief.keyRelationship}</Panel>
      </div>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
          A plan for tomorrow
        </h2>
        <ol className="mt-4 flex flex-col gap-2">
          {brief.recommendedPlan.map((step, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-card border border-ink-wash bg-white px-4 py-3"
            >
              <span className="text-[13px] font-medium text-ink-tint">{i + 1}</span>
              <span className="text-[15px] leading-relaxed text-ink-black">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {byGroup.size > 0 ? (
        <section className="mt-10">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
            Who to check on
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {[...byGroup.entries()].map(([group, names]) => {
              const positive = POSITIVE_GROUPS.has(group);
              return (
                <div
                  key={group}
                  className="rounded-card border border-ink-wash bg-white p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        positive
                          ? "inline-block h-2 w-2 rounded-full bg-ink-tint"
                          : "inline-block h-2 w-2 rounded-full bg-warm"
                      }
                      aria-hidden
                    />
                    <p className="text-[14px] font-medium text-ink-black">
                      {GROUP_LABELS[group]}
                    </p>
                  </div>
                  <p className="mt-2 text-[14px] text-secondary">{names.join(", ")}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function BackLink(): ReactElement {
  return (
    <Link href="/lessons" className="text-[13px] text-ink-tint hover:underline">
      ← All reflections
    </Link>
  );
}

function Panel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div className="rounded-card border border-ink-wash bg-white p-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-secondary">
        {label}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-black">{children}</p>
    </div>
  );
}
