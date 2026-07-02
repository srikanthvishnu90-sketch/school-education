import type { Id } from "../common";

/**
 * Driven ports for the two things a pure service is not allowed to reach for
 * directly: the current time and fresh identifiers. Injecting them keeps services
 * deterministic and testable, and is why there is no `Date.now()` or randomness
 * anywhere in the codebase (CLAUDE.md → Build standard; P4 contract).
 */

export interface Clock {
  /** The current instant. Implementations decide how it advances. */
  now(): Date;
}

export interface IdGenerator {
  /** A fresh identifier, optionally namespaced by `prefix`. */
  next(prefix?: string): Id;
}
