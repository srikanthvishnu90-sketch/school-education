"use server";

import { createLesson, type LessonType } from "@/domain/intelligence/lesson";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "@/domain/intelligence/insight";
import { createReflectionPerformance } from "@/domain/intelligence/metacognition";
import type { ClassStudentInput } from "@/domain/ports/intelligence";
import { getSessionUser } from "./session";
import { getWorld } from "./world";
import { TEACHER_ID, studentDisplayName } from "./teacher";
import { getLessonPhotos, saveLessonPhotos } from "./lessonMedia";

/**
 * The teacher side of the reflection loop: enter a lesson, and the AI reads it,
 * drafts a short balanced reflection, and (once students have reflected) rolls
 * their summaries into one class brief with attention groups and a plan. The AI
 * only drafts and structures here — counts and grouping are deterministic, and
 * no diagnosis can pass the summary factories.
 */

/** The demo teacher owns one class; a real build resolves this from the roster. */
const TEACHER_CLASS_ID = "class-1";

export interface NewLessonInput {
  title: string;
  lessonType: LessonType;
  content: string;
  /** Optional photos of the day's work, as data URLs. */
  photos?: string[];
}

export interface LessonDetail {
  reflectionId: string;
  title: string;
  lessonType: LessonType;
  content: string;
  photos: string[];
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

export interface StudentScoreRow {
  studentId: string;
  name: string;
  /** The score already recorded for this reflection, as a percent, or null. */
  scorePercent: number | null;
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
  if (input.photos !== undefined && input.photos.length > 0) {
    saveLessonPhotos(id, input.photos);
  }
  const analysis = await world.intelligence.analyzeLesson({ lesson });
  const set = await world.intelligence.generateReflectionQuestions({
    analysis,
    depth: "standard",
    adaptiveFollowups: true,
  });
  await world.intel.questionSets.save(set);
  return id;
}

/** The lesson's own content — the summary of the day and any photos the teacher added. */
export async function getLessonDetail(reflectionId: string): Promise<LessonDetail | null> {
  await requireTeacher();
  const world = await getWorld();
  const lesson = await world.intel.lessons.findById(reflectionId);
  if (lesson === null) return null;
  return {
    reflectionId,
    title: lesson.title,
    lessonType: lesson.lessonType,
    content: lesson.content,
    photos: getLessonPhotos(reflectionId),
  };
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

/**
 * The students who finished reflecting on a lesson, with any score already recorded
 * — the roster the teacher enters graded results against (P7 score entry).
 */
export async function listScoreRows(reflectionId: string): Promise<StudentScoreRow[]> {
  await requireTeacher();
  const world = await getWorld();
  const sessions = (await world.intel.sessions.listByReflection(reflectionId)).filter(
    (s) => s.status === "completed",
  );
  const seen = new Set<string>();
  const rows: StudentScoreRow[] = [];
  for (const session of sessions) {
    if (seen.has(session.studentId)) continue;
    seen.add(session.studentId);
    const perf = await world.intel.performances.findByReflectionAndStudent(
      reflectionId,
      session.studentId,
    );
    rows.push({
      studentId: session.studentId,
      name: studentDisplayName(session.studentId),
      scorePercent: perf === null ? null : Math.round(perf.score * 100),
    });
  }
  return rows;
}

/**
 * Record a graded result (0–100%) for one student's reflection. This is the honest
 * score the reflection's self-confidence is later set beside — never a pre-registered
 * bet. Overwrites any prior score for the same (reflection, student).
 */
export async function recordReflectionScore(
  reflectionId: string,
  studentId: string,
  scorePercent: number,
): Promise<void> {
  await requireTeacher();
  if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
    throw new Error("A score must be between 0 and 100.");
  }
  const world = await getWorld();
  await world.intel.performances.save(
    createReflectionPerformance({
      reflectionId,
      studentId,
      score: scorePercent / 100,
      recordedAt: world.clock.now(),
    }),
  );
}
