"use server";

import { createLesson, type Lesson, type LessonType } from "@/domain/intelligence/lesson";
import type {
  ClassInsightSummary,
  StudentInsightSummary,
} from "@/domain/intelligence/insight";
import { createReflectionPerformance } from "@/domain/intelligence/metacognition";
import type { ClassStudentInput } from "@/domain/ports/intelligence";
import { getSessionUser } from "./session";
import { getWorld, type World } from "./world";
import { studentDisplayName } from "./teacher";
import {
  deleteLessonPhotos,
  getLessonPhotos,
  saveLessonPhotos,
} from "./lessonMedia";
import { getRoster, parseRoster, saveRoster } from "./rosterNames";
import { recordAudit } from "./auditLog";

/**
 * The teacher side of the reflection loop: enter a lesson, and the AI reads it,
 * drafts a short balanced reflection, and (once students have reflected) rolls
 * their summaries into one class brief with attention groups and a plan. The AI
 * only drafts and structures here — counts and grouping are deterministic, and
 * no diagnosis can pass the summary factories.
 */

/** The demo teacher owns one class; a real build resolves this from the roster. */
const TEACHER_CLASS_ID = "class-1";

/** The signed-in teacher (id + tenant), or a thrown refusal. Server-authoritative. */
async function requireTeacher(): Promise<{ id: string; tenantId: string }> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") {
    throw new Error("Only a teacher can do this.");
  }
  return { id: user.id, tenantId: user.tenantId };
}

/**
 * Load a lesson only if the caller owns it (created it). Ownership is by
 * `lesson.teacherId`, so one teacher can never read or grade another teacher's
 * lesson or students. A missing OR non-owned lesson returns null with the same
 * shape, so existence is never leaked.
 */
async function ownedLesson(
  world: World,
  reflectionId: string,
  teacher: { id: string; tenantId: string },
): Promise<Lesson | null> {
  const lesson = await world.intel.lessons.findById(reflectionId);
  if (
    lesson === null ||
    lesson.teacherId !== teacher.id ||
    lesson.tenantId !== teacher.tenantId
  ) {
    return null;
  }
  return lesson;
}

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

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Every lesson the teacher's class has, newest activity first, with reflection tallies. */
export async function listTeacherLessons(): Promise<LessonListItem[]> {
  const teacher = await requireTeacher();
  const world = await getWorld();
  const lessons = (await world.intel.lessons.listByClass(TEACHER_CLASS_ID)).filter(
    (l) => l.teacherId === teacher.id && l.tenantId === teacher.tenantId,
  );
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
  const teacher = await requireTeacher();
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
    tenantId: teacher.tenantId,
    classId: TEACHER_CLASS_ID,
    teacherId: teacher.id,
    title,
    date: now,
    lessonType: input.lessonType,
    content: input.content.trim(),
    objectives: [],
    standards: [],
    createdAt: now,
  });
  await world.intel.lessons.save(lesson);
  const photos =
    input.photos !== undefined && input.photos.length > 0 ? input.photos : undefined;
  if (photos !== undefined) {
    await saveLessonPhotos(id, photos);
  }
  // The AI reads the photos of the day's work together with the text.
  const analysis = await world.intelligence.analyzeLesson({ lesson, photos });
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
  const teacher = await requireTeacher();
  const world = await getWorld();
  const lesson = await ownedLesson(world, reflectionId, teacher);
  if (lesson === null) return null;
  recordAudit({
    tenantId: teacher.tenantId,
    actorId: teacher.id,
    actorRole: "teacher",
    action: "view_lesson",
    reflectionId,
    at: world.clock.now(),
  });
  return {
    reflectionId,
    title: lesson.title,
    lessonType: lesson.lessonType,
    content: lesson.content,
    photos: await getLessonPhotos(reflectionId),
  };
}

/**
 * Delete a lesson the caller owns: the lesson, its generated question set, and its
 * photos. Students' already-submitted reflections are intentionally NOT erased —
 * a student's reflection is the student's data (it stays on their timeline). This
 * removes the lesson from the teacher's board and stops new reflections on it.
 */
export async function deleteLesson(reflectionId: string): Promise<{ ok: boolean }> {
  const teacher = await requireTeacher();
  const world = await getWorld();
  const lesson = await ownedLesson(world, reflectionId, teacher);
  if (lesson === null) return { ok: false };

  await world.intel.lessons.delete(lesson.id);
  await world.intel.questionSets.deleteByLesson(lesson.id);
  await deleteLessonPhotos(reflectionId);

  recordAudit({
    tenantId: teacher.tenantId,
    actorId: teacher.id,
    actorRole: "teacher",
    action: "delete_lesson",
    reflectionId,
    at: world.clock.now(),
  });
  return { ok: true };
}

/**
 * The teacher's class roster — the student names for their class. Registering it
 * does double duty: the teacher gets their roster back for display, and the names
 * feed the intelligence adapter's PII redaction set (see rosterNames), so real
 * student names are stripped before any model call instead of only the demo seed.
 * One roster per teacher, scoped to their tenant.
 */
export async function saveClassRoster(rosterText: string): Promise<string[]> {
  const teacher = await requireTeacher();
  const names = parseRoster(rosterText);
  await saveRoster(teacher.id, teacher.tenantId, names);
  return names;
}

export async function getClassRoster(): Promise<string[]> {
  const teacher = await requireTeacher();
  return getRoster(teacher.id);
}

/**
 * Roll every completed reflection for a lesson into one class brief. Re-derives
 * each student's signals deterministically, aggregates via the intelligence
 * service, persists the brief, and returns it with the per-student summaries.
 * Returns null until at least one student has finished reflecting.
 */
export async function buildClassBrief(reflectionId: string): Promise<ClassBriefView | null> {
  const teacher = await requireTeacher();
  const world = await getWorld();
  if ((await ownedLesson(world, reflectionId, teacher)) === null) return null;
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
  // Reading a brief exposes each contributing student's summary — record access
  // to each (FERPA who-saw-what).
  for (const s of students) {
    recordAudit({
      tenantId: teacher.tenantId,
    actorId: teacher.id,
      actorRole: "teacher",
      action: "view_class_brief",
      reflectionId,
      studentId: s.studentId,
      at: world.clock.now(),
    });
  }
  return { brief, students: summaries };
}

/**
 * The students who finished reflecting on a lesson, with any score already recorded
 * — the roster the teacher enters graded results against (P7 score entry).
 */
export async function listScoreRows(reflectionId: string): Promise<StudentScoreRow[]> {
  const teacher = await requireTeacher();
  const world = await getWorld();
  if ((await ownedLesson(world, reflectionId, teacher)) === null) return [];
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
  // FERPA record-of-access: reading students' scores is an access event, so log it.
  if (rows.length > 0) {
    recordAudit({
      tenantId: teacher.tenantId,
      actorId: teacher.id,
      actorRole: "teacher",
      action: "view_scores",
      reflectionId,
      at: world.clock.now(),
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
  const teacher = await requireTeacher();
  if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
    throw new Error("A score must be between 0 and 100.");
  }
  const world = await getWorld();
  // The lesson must be the caller's, and the student must actually have a session
  // on it — a teacher can't score another teacher's class or an arbitrary id.
  if ((await ownedLesson(world, reflectionId, teacher)) === null) {
    throw new Error("That lesson isn’t available.");
  }
  const participated = (
    await world.intel.sessions.listByReflection(reflectionId)
  ).some((s) => s.studentId === studentId);
  if (!participated) {
    throw new Error("That student hasn’t reflected on this lesson.");
  }
  await world.intel.performances.save(
    createReflectionPerformance({
      reflectionId,
      studentId,
      score: scorePercent / 100,
      recordedAt: world.clock.now(),
    }),
  );
  recordAudit({
    tenantId: teacher.tenantId,
    actorId: teacher.id,
    actorRole: "teacher",
    action: "record_score",
    reflectionId,
    studentId,
    at: world.clock.now(),
  });
}
