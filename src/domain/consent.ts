import { type Id } from "./common";
import { consentRecordSchema } from "./schemas/academic";

/**
 * Consent as a domain object with a lifecycle, not a boolean flag (CLAUDE.md /
 * SOPPA/COPPA). A record grants specific scopes; a later revocation withdraws
 * them. "Data flows to the student" is enforced downstream by row-level security,
 * but the RIGHT to capture affect at all is gated here: affect capture refuses
 * unless the affect scope is currently granted.
 */

export type ConsentScope = "academic" | "affect";
export type ConsentGrantor = "parent" | "self";
export type ConsentStatus = "granted" | "revoked";

export interface ConsentRecord {
  id: Id;
  studentId: Id;
  grantorType: ConsentGrantor;
  scopes: ConsentScope[];
  status: ConsentStatus;
  grantedAt: Date;
  /** Set when this record is a revocation (status = "revoked"). */
  revokedAt?: Date;
}

export function createConsentRecord(input: ConsentRecord): ConsentRecord {
  return Object.freeze(consentRecordSchema.parse(input));
}

/**
 * The audit trail a revocation leaves: what was deleted, how much, and when. The
 * academic data it does NOT mention is retained per the data-processing
 * agreement; only the named scope's rows are hard-deleted.
 */
export interface DeletionReceipt {
  id: Id;
  studentId: Id;
  scope: ConsentScope;
  rowsDeleted: number;
  deletedAt: Date;
}

/** The moment a record takes effect (a revocation at its revokedAt, else grantedAt). */
function effectiveAt(record: ConsentRecord): number {
  return (record.revokedAt ?? record.grantedAt).getTime();
}

/**
 * The scopes currently in force for a student, replaying their records in time
 * order: a grant adds its scopes, a revocation removes them. The latest event
 * wins, so grant→revoke leaves the scope withdrawn and revoke→grant restores it.
 */
export function effectiveScopes(
  records: readonly ConsentRecord[],
): Set<ConsentScope> {
  const ordered = [...records].sort((a, b) => effectiveAt(a) - effectiveAt(b));
  const active = new Set<ConsentScope>();
  for (const record of ordered) {
    for (const scope of record.scopes) {
      if (record.status === "granted") active.add(scope);
      else active.delete(scope);
    }
  }
  return active;
}

/** True when `scope` is currently granted for the student. */
export function hasScope(
  records: readonly ConsentRecord[],
  scope: ConsentScope,
): boolean {
  return effectiveScopes(records).has(scope);
}
