import { z } from "zod";

/**
 * Zod schemas for the shared value-object primitives (see ../common.ts).
 * These are the single runtime source of truth for ranges; entity schemas and
 * factories compose them rather than re-declaring `.min(0).max(1)` everywhere.
 */

export const idSchema = z.string().min(1, "id must be a non-empty string");

/** [0, 1] — probability / normalized score. */
export const unitIntervalSchema = z
  .number()
  .refine((n) => Number.isFinite(n), "must be a finite number")
  .refine((n) => n >= 0 && n <= 1, "must be within [0, 1]");

/** [-1, 1] — affective valence. */
export const valenceSchema = z
  .number()
  .refine((n) => Number.isFinite(n), "must be a finite number")
  .refine((n) => n >= -1 && n <= 1, "valence must be within [-1, 1]");

/** [0, 1] — affective arousal. */
export const arousalSchema = z
  .number()
  .refine((n) => Number.isFinite(n), "must be a finite number")
  .refine((n) => n >= 0 && n <= 1, "arousal must be within [0, 1]");

/** Points are non-negative reals. */
export const nonNegativeSchema = z
  .number()
  .refine((n) => Number.isFinite(n), "must be a finite number")
  .refine((n) => n >= 0, "must be >= 0");
