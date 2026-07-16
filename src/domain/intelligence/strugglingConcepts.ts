import { type Id } from "../common";
import type { TechnicalSignal } from "./signals";

/**
 * Which concepts a lot of students are struggling with — a deterministic
 * aggregation across the reflections a class has completed. This is COUNTING, and
 * per CLAUDE.md ("AI = labor, not judgment"; "counts and grouping are
 * deterministic") it lives in the open here: the model may have drafted the
 * concept list and tagged each conversation's signals, but which concept gets
 * flagged, and the bar for flagging it, is decided by rule, not by a model.
 *
 * A concept is flagged only on EVIDENCE. A student is counted against a concept
 * when they BOTH showed a technical struggle signal AND referred to that concept
 * in their own words. So every flag traces back to named students who actually
 * said something about it — never a diagnosis inferred over their heads.
 */

/**
 * The technical signals that mean the student had trouble — as opposed to
 * `understood_concept`, `can_explain`, `independent_application`, or the neutral
 * process tags (`time_management`, `careless_error`).
 */
export const STRUGGLE_TECHNICAL_SIGNALS: readonly TechnicalSignal[] = [
  "misunderstood_concept",
  "unclear_step",
  "misconception",
  "recall_difficulty",
  "application_difficulty",
  "reading_difficulty",
  "prerequisite_gap",
];

const STRUGGLE_SET: ReadonlySet<TechnicalSignal> = new Set(STRUGGLE_TECHNICAL_SIGNALS);

/** True when a technical signal indicates the student struggled with the work. */
export function isStruggleSignal(signal: TechnicalSignal): boolean {
  return STRUGGLE_SET.has(signal);
}

/** True when any of a reflection's technical signals mark a struggle. */
export function hasStruggleSignal(signals: readonly TechnicalSignal[]): boolean {
  return signals.some(isStruggleSignal);
}

/** One completed reflection, reduced to just what concept-flagging needs. */
export interface ReflectionStruggleInput {
  studentId: Id;
  /** True when the student's technical signals include any struggle marker. */
  struggling: boolean;
  /** The student's own words across the reflection — the source for attribution. */
  answerText: string;
}

/** A concept enough struggling students referred to that it's worth surfacing. */
export interface StrugglingConcept {
  concept: string;
  /** The struggling students who referred to this concept. */
  studentIds: Id[];
  studentCount: number;
}

export interface StrugglingConceptReport {
  /** Reflections considered (one per student who has finished). */
  completedCount: number;
  /** How many of those students struggled with the work at all. */
  strugglingCount: number;
  /** Flagged concepts, most students first. Empty when nothing clears the bar. */
  concepts: StrugglingConcept[];
}

/** Collapse to lowercase alphanumeric words so casual phrasing still matches. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Did the student refer to this concept in their own words? A normalized,
 * whitespace-insensitive substring match — forgiving of punctuation and case,
 * but still grounded in the student actually naming the thing.
 */
export function conceptMentioned(answerText: string, concept: string): boolean {
  const needle = normalize(concept);
  if (needle.length === 0) return false;
  const haystack = ` ${normalize(answerText)} `;
  return haystack.includes(` ${needle} `) || normalize(answerText).includes(needle);
}

export interface IdentifyOptions {
  /** Floor on struggling students before a concept is worth flagging. */
  minStudents?: number;
  /** ...also as a fraction of completed reflections ("a lot of students"). */
  minFraction?: number;
  /** Cap on how many concepts to surface, so the teacher gets a focus, not a list. */
  limit?: number;
}

const DEFAULT_MIN_STUDENTS = 2;
const DEFAULT_MIN_FRACTION = 0.3;
const DEFAULT_LIMIT = 3;

/**
 * Flag the concepts that a lot of students are struggling with. A concept clears
 * the bar when the number of struggling students who named it is at least
 * `minStudents` AND at least `minFraction` of everyone who reflected — so a single
 * frustrated student can't raise a class-wide flag, and the bar scales with the
 * class. Results are ranked by how many students, then alphabetically.
 */
export function identifyStrugglingConcepts(
  concepts: readonly string[],
  reflections: readonly ReflectionStruggleInput[],
  options: IdentifyOptions = {},
): StrugglingConceptReport {
  const completedCount = reflections.length;
  const strugglers = reflections.filter((r) => r.struggling);
  const minStudents = options.minStudents ?? DEFAULT_MIN_STUDENTS;
  const minFraction = options.minFraction ?? DEFAULT_MIN_FRACTION;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const threshold = Math.max(minStudents, Math.ceil(completedCount * minFraction));

  // Dedup the concept pool case-insensitively, keeping the first (nicest) spelling.
  const byKey = new Map<string, string>();
  for (const raw of concepts) {
    const label = raw.trim();
    const key = normalize(label);
    if (key.length > 0 && !byKey.has(key)) byKey.set(key, label);
  }

  const flagged: StrugglingConcept[] = [];
  for (const label of byKey.values()) {
    const studentIds = strugglers
      .filter((r) => conceptMentioned(r.answerText, label))
      .map((r) => r.studentId);
    if (studentIds.length >= threshold) {
      flagged.push({ concept: label, studentIds, studentCount: studentIds.length });
    }
  }
  flagged.sort(
    (a, b) => b.studentCount - a.studentCount || a.concept.localeCompare(b.concept),
  );
  return {
    completedCount,
    strugglingCount: strugglers.length,
    concepts: flagged.slice(0, limit),
  };
}
