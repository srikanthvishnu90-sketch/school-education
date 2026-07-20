import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import {
  buildClassBrief,
  getLessonDetail,
  getReflectionDraft,
  listScoreRows,
  listTeacherLessons,
} from "@/app/_world/teacherReflectionActions";
import { studentDisplayName, TEACHER_NAME } from "@/app/_world/teacher";
import type { AttentionGroup } from "@/domain/intelligence/insight";
import type { LessonType } from "@/domain/intelligence/lesson";
import TeacherShell from "../TeacherShell";
import ApproveQuestions from "./ApproveQuestions";
import DeleteLessonButton from "./DeleteLessonButton";
import ScoreEntry from "./ScoreEntry";

const LESSON_TYPE_LABELS: Record<LessonType, string> = {
  direct_instruction: "Direct instruction",
  discussion: "Discussion",
  group_work: "Group work",
  independent_practice: "Independent practice",
  lab: "Lab",
  presentation: "Presentation",
  project: "Project",
  review: "Review",
  assessment_prep: "Assessment prep",
  other: "Other",
};

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

  const lesson = await getLessonDetail(reflectionId);
  if (lesson === null) notFound();

  const [view, scoreRows, allLessons, draft] = await Promise.all([
    buildClassBrief(reflectionId),
    listScoreRows(reflectionId),
    listTeacherLessons(),
    getReflectionDraft(reflectionId),
  ]);
  const awaitingApproval = draft !== null && !draft.approved;
  const byGroup = new Map<AttentionGroup, string[]>();
  if (view !== null) {
    for (const s of view.brief.attentionStudents) {
      const names = byGroup.get(s.group) ?? [];
      names.push(studentDisplayName(s.studentId));
      byGroup.set(s.group, names);
    }
  }

  return (
    <TeacherShell
      teacherName={TEACHER_NAME}
      lessons={allLessons.map((l) => ({ reflectionId: l.reflectionId, title: l.title }))}
      activeId={reflectionId}
    >
      {/* Today's lesson — the summary the teacher wrote, and any photos. */}
      <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        {LESSON_TYPE_LABELS[lesson.lessonType]}
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
        {lesson.title}
      </h1>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-black">
        {lesson.content}
      </p>
      {lesson.photos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {lesson.photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Lesson photo ${i + 1}`}
              className="aspect-square w-full rounded-control border border-ink-wash object-cover"
            />
          ))}
        </div>
      )}

      {awaitingApproval && draft !== null ? (
        <ApproveQuestions reflectionId={reflectionId} questions={draft.questions} />
      ) : view === null ? (
        <p className="mt-10 rounded-card border border-ink-wash bg-white p-5 text-[15px] leading-relaxed text-secondary">
          The class brief appears once at least one student has finished reflecting on
          this lesson. You can still enter graded results below.
        </p>
      ) : (
        <ClassBriefBody view={view} byGroup={byGroup} />
      )}

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
          Graded results
        </h2>
        <p className="mt-2 text-[14px] text-secondary">
          Enter each student&rsquo;s score for this work. It sits beside how sure they
          felt on their own timeline — recorded after the fact, never a bet up front.
        </p>
        <div className="mt-4">
          <ScoreEntry reflectionId={reflectionId} rows={scoreRows} />
        </div>
      </section>

      <section className="mt-12 border-t border-ink-wash pt-6">
        <DeleteLessonButton reflectionId={reflectionId} />
      </section>
    </TeacherShell>
  );
}

function ClassBriefBody({
  view,
  byGroup,
}: {
  view: NonNullable<Awaited<ReturnType<typeof buildClassBrief>>>;
  byGroup: Map<AttentionGroup, string[]>;
}): ReactElement {
  const { brief, studentCount } = view;
  return (
    <>
      <p className="mt-10 text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        Class brief · {studentCount} reflection{studentCount === 1 ? "" : "s"}
      </p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink-black">
        Where the class landed
      </h2>

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

      {/* Per-student emotional drill-down deliberately REMOVED. Under plumb's
          principles a teacher sees the class as an aggregate brief only, never
          an individual student's emotional writing (Part 1 #1 / IA Part 3). The
          only student-level view is the observed "who to check on" grouping
          below, which names support needs without exposing anyone's words. */}
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
    </>
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
