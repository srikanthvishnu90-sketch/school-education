/**
 * RosterSource — the port that abstracts WHERE a class roster comes from. A teacher
 * may paste names by hand (the manual source) or import them from an external system
 * of record such as Google Classroom. Both are one implementation of this interface,
 * so the rest of the app never branches on the origin of a name.
 *
 * This port is pure: it names the shape of an import, not how any provider fetches it.
 * Adapters (which MAY read env for feature flags and credentials) live in
 * `src/adapters/rostering`.
 *
 * CONSENT & PII: importing here does NOT bypass the app's privacy path. Names brought
 * in through a RosterSource are still written through the existing roster store
 * (`saveRoster`), which refreshes the PII-redaction snapshot, and are still subject to
 * the same consent gate as manually entered names. A roster source is a way to POPULATE
 * the roster, never a side door around redaction or consent.
 */

/** Where a roster came from. Extend the union when a new provider is wired. */
export type RosterSourceKind = "manual" | "google_classroom";

/** One student as an external system reports them, before it enters the app's roster. */
export interface ImportedStudent {
  /** Stable identifier from the source (a slug for manual, the provider userId otherwise). */
  externalId: string;
  /** The student's full display name, exactly as it will be redacted and displayed. */
  displayName: string;
}

/** The result of importing one course's roster from a source. */
export interface ImportedRoster {
  source: RosterSourceKind;
  courseId: string;
  students: ImportedStudent[];
}

/**
 * A source of class rosters. `isConfigured()` reports whether this source can actually
 * import (e.g. its credentials are present); `importRoster` MUST fail closed with an
 * actionable error when it cannot, never return fabricated data.
 */
export interface RosterSource {
  readonly kind: RosterSourceKind;
  isConfigured(): boolean;
  importRoster(courseId: string): Promise<ImportedRoster>;
}
