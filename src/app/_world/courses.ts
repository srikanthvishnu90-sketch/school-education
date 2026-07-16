import type { Id } from "@/domain";

/**
 * The demo course catalog. A course IS a class in the domain (lessons carry a
 * classId), so these ids are real class ids — `class-1` is the teacher's seeded
 * class and already holds the demo lesson. The rest are enrolled-but-quiet: they
 * legitimately show zero reflections until a teacher posts one, which is the
 * honest empty state rather than fabricated coursework.
 */

export interface Course {
  id: Id;
  name: string;
  code: string;
  teacher: string;
  /** Two-letter monogram for the card, since the shell carries no imagery. */
  monogram: string;
}

export const COURSES: readonly Course[] = [
  {
    id: "class-1",
    name: "Algebra II",
    code: "MATH_201_A",
    teacher: "Ms. Rivera",
    monogram: "AL",
  },
  {
    id: "class-chem",
    name: "Chemistry",
    code: "SCI_110_B",
    teacher: "Mr. Okonkwo",
    monogram: "CH",
  },
  {
    id: "class-english",
    name: "English Literature",
    code: "ENG_105_C",
    teacher: "Ms. Bhatt",
    monogram: "EN",
  },
  {
    id: "class-history",
    name: "US History",
    code: "HIS_120_A",
    teacher: "Mr. Delgado",
    monogram: "US",
  },
];

export function findCourse(id: Id): Course | null {
  return COURSES.find((c) => c.id === id) ?? null;
}
