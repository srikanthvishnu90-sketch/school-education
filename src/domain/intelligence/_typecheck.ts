import type { z } from "zod";

import type { Lesson, LessonAnalysis } from "./lesson";
import type { GeneratedQuestion, ReflectionQuestionSet } from "./question";
import type {
  generatedQuestionSchema,
  lessonAnalysisSchema,
  lessonSchema,
  reflectionQuestionSetSchema,
} from "../schemas/intelligence";

/**
 * Compile-time guarantee that each intelligence interface stays exactly in sync
 * with its Zod schema. Pure type-level assertion — nothing runs. Same technique
 * as ../schemas/_typecheck.ts. (CLAUDE.md → Build standard.)
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

export type _LessonSync = Expect<Equal<Lesson, z.infer<typeof lessonSchema>>>;
export type _LessonAnalysisSync = Expect<
  Equal<LessonAnalysis, z.infer<typeof lessonAnalysisSchema>>
>;
export type _GeneratedQuestionSync = Expect<
  Equal<GeneratedQuestion, z.infer<typeof generatedQuestionSchema>>
>;
export type _ReflectionQuestionSetSync = Expect<
  Equal<ReflectionQuestionSet, z.infer<typeof reflectionQuestionSetSchema>>
>;
