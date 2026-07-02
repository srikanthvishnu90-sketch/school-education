import type { Clock, IdGenerator } from "@/domain/ports";

/**
 * Deterministic in-memory Clock. Starts at `startEpochMs` and advances a fixed
 * `stepMs` on every `now()` call, so a sequence of service calls gets strictly
 * increasing, reproducible timestamps (this is what makes
 * assertPredictionPrecedesOutcome hold in the seed without any wall clock).
 */
export function createSequentialClock(
  startEpochMs: number,
  stepMs = 1000,
): Clock {
  let tick = 0;
  return {
    now(): Date {
      const at = new Date(startEpochMs + tick * stepMs);
      tick += 1;
      return at;
    },
  };
}

/** Deterministic id generator: `${prefix}-${n}`, counting per prefix from 1. */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix = "id"): string {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}
