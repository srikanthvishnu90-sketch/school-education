"use server";

import { createLesson, type LessonType } from "@/domain/intelligence/lesson";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "@/domain/intelligence/insight";
import type { ClassStudentInput } from "@/domain/ports/intelligence";
import { getSessionUser } from "./session";
import { getWorld } from "./world";
import { TEACHER_ID } from "./teacher";

/**
 * The teacher side of the reflection loop: enter a lesson, and the AI reads it,
 * drafts a short balanced reflection, and (once students have reflected) rolls
 * their summaries into one class brief with attention groups and a plan. The AI
 * only drafts and structures here — counts and grouping are deterministic, and
 * no diagnosis can pass the summary factories.
 */

/** The demo teacher owns one class; a real build resolves this from the roster. */
export const TEACHER_CLASS_ID = "class-1";

export interface NewLessonInput {
  title: string;
  lessonType: LessonType;
  content: string;
}

export interface LessonListItem {
  reflectionId: string;
  title: string;
  lessonType: LessonType;
  reflectionCount: number;
  completedCount: number;
  hasBrief: boolean;
}

export interface ClassBriefView {
  brief: ClassInsightSummary;
  students: StudentInsightSummary[];
}

async function requireTeacher(): Promise<void> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") {
    throw new Error("Only a teacher can do this.");
  }
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Every lesson the teacher's class has, newest activity first, with reflection tallies. */
export async function listTeacherLessons(): Promise<LessonListItem[]> {
  await requireTeacher();
  const world = await getWorld();
  const lessons = await world.intel.lessons.listByClass(TEACHER_CLASS_ID);
  const items = await Promise.all(
    lessons.map(async (lesson): Promise<LessonListItem> => {
      const sessions = await world.intel.sessions.listByReflection(lesson.id);
      const brief = await world.intel.classSummaries.findByReflection(lesson.id);
      return {
        reflectionId: lesson.id,
        title: lesson.title,
        lessonType: lesson.lessonType,
        reflectionCount: sessions.length,
        completedCount: sessions.filter((s) => s.status === "completed").length,
        hasBrief: brief !== null,
      };
    }),
  );
  return items;
}

/**
 * Create a lesson, let the AI read it and draft the reflection, and persist both.
 * Returns the reflectionId (== lesson id) the student chat and brief hang off.
 */
export async function createLessonReflection(input: NewLessonInput): Promise<string> {
  await requireTeacher();
  const world = await getWorld();
  const now = world.clock.now();
  const title = input.title.trim();
  if (title.length === 0) throw new Error("A lesson needs a title.");
  if (input.content.trim().length === 0) {
    throw new Error("Add a few lines about what happened in class.");
  }
  const id = `lesson-${slug(title)}-${now.getTime()}`;
  const lesson = createLesson({
    id,
    classId: TEACHER_CLASS_ID,
    teacherId: TEACHER_ID,
    title,
    date: now,
    lessonType: input.lessonType,
    content: input.content.trim(),
    objectives: [],
    standards: [],
    createdAt: now,
  });
  await world.intel.lessons.save(lesson);
  const analysis = await world.intelligence.analyzeLesson({ lesson });
  const set = await world.intelligence.generateReflectionQuestions({
    analysis,
    depth: "standard",
    adaptiveFollowups: true,
  });
  await world.intel.questionSets.save(set);
  return id;
}

/**
 * Roll every completed reflection for a lesson into one class brief. Re-derives
 * each student's signals deterministically, aggregates via the intelligence
 * service, persists the brief, and returns it with the per-student summaries.
 * Returns null until at least one student has finished reflecting.
 */
export async function buildClassBrief(reflectionId: string): Promise<ClassBriefView | null> {
  await requireTeacher();
  const world = await getWorld();
  const sessions = (await world.intel.sessions.listByReflection(reflectionId)).filter(
    (s) => s.status === "completed",
  );
  const students: ClassStudentInput[] = [];
  const summaries: StudentInsightSummary[] = [];
  for (const session of sessions) {
    const summary = await world.intel.studentSummaries.findByReflectionAndStudent(
      reflectionId,
      session.studentId,
    );
    if (summary === null) continue;
    const signals = await world.intelligence.extractSignals({ session });
    students.push({ studentId: session.studentId, summary, signals });
    summaries.push(summary);
  }
  if (students.length === 0) return null;
  const brief = await world.intelligence.summarizeClassReflection({
    classId: TEACHER_CLASS_ID,
    reflectionId,
    students,
  });
  await world.intel.classSummaries.save(brief);
  return { brief, students: summaries };
}
