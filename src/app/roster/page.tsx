import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import {
  getClassRoster,
  listTeacherLessons,
} from "@/app/_world/teacherReflectionActions";
import { TEACHER_NAME } from "@/app/_world/teacher";
import TeacherShell from "@/app/lessons/TeacherShell";
import RosterForm from "./RosterForm";

/**
 * The class-roster surface, inside the teacher shell. Registering names does two
 * things: it's the teacher's class list, and it feeds PII redaction so real
 * student names are stripped before any model call.
 */
export default async function RosterPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") redirect("/signin");

  const [roster, lessons] = await Promise.all([
    getClassRoster(),
    listTeacherLessons(),
  ]);

  return (
    <TeacherShell
      teacherName={TEACHER_NAME}
      lessons={lessons.map((l) => ({ reflectionId: l.reflectionId, title: l.title }))}
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-black">Class roster</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-secondary">
        Add the students in your class. Beyond being your class list, these names are
        stripped out of anything the reflection assistant processes — so a student&rsquo;s
        name is redacted before a payload is sent to a model.
      </p>

      <div className="mt-6 max-w-2xl rounded-card border border-ink-wash bg-white p-5">
        <RosterForm initial={roster} />
      </div>
    </TeacherShell>
  );
}
