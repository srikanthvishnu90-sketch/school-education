import {
  createConsentRecord,
  effectiveScopes,
  type ConsentGrantor,
  type ConsentRecord,
  type ConsentScope,
  type DeletionReceipt,
  type Id,
} from "@/domain";
import type {
  AffectRepository,
  Clock,
  ConsentRepository,
  IdGenerator,
} from "@/domain/ports";

/**
 * ConsentService — the lifecycle of SOPPA/COPPA consent. Granting records the
 * scopes; revoking records the withdrawal AND runs the deletion workflow: when
 * the affect scope is revoked, affect rows are HARD-deleted, a deletion receipt
 * is recorded, and academic data is RETAINED per the data-processing agreement.
 * Deterministic: timestamps and ids are injected.
 */

export interface ConsentServiceDeps {
  clock: Clock;
  ids: IdGenerator;
  consent: ConsentRepository;
  affects: AffectRepository;
}

export interface GrantInput {
  studentId: Id;
  grantorType: ConsentGrantor;
  scopes: ConsentScope[];
}

export interface RevokeInput {
  studentId: Id;
  scopes: ConsentScope[];
  grantorType?: ConsentGrantor;
}

export interface RevokeResult {
  record: ConsentRecord;
  receipts: DeletionReceipt[];
}

export interface ConsentService {
  grant(input: GrantInput): Promise<ConsentRecord>;
  revoke(input: RevokeInput): Promise<RevokeResult>;
  currentScopes(studentId: Id): Promise<ConsentScope[]>;
}

export function createConsentService(deps: ConsentServiceDeps): ConsentService {
  const { clock, ids } = deps;
  return {
    async grant(input) {
      const record = createConsentRecord({
        id: ids.next("consent"),
        studentId: input.studentId,
        grantorType: input.grantorType,
        scopes: input.scopes,
        status: "granted",
        grantedAt: clock.now(),
      });
      await deps.consent.save(record);
      return record;
    },

    async revoke(input) {
      const at = clock.now();
      const record = createConsentRecord({
        id: ids.next("consent"),
        studentId: input.studentId,
        grantorType: input.grantorType ?? "self",
        scopes: input.scopes,
        status: "revoked",
        grantedAt: at,
        revokedAt: at,
      });
      await deps.consent.save(record);

      const receipts: DeletionReceipt[] = [];
      // Revoking affect triggers the deletion workflow; academic is retained.
      if (input.scopes.includes("affect")) {
        const rowsDeleted = await deps.affects.deleteByStudent(input.studentId);
        const receipt: DeletionReceipt = {
          id: ids.next("receipt"),
          studentId: input.studentId,
          scope: "affect",
          rowsDeleted,
          deletedAt: at,
        };
        await deps.consent.recordDeletion(receipt);
        receipts.push(receipt);
      }
      return { record, receipts };
    },

    async currentScopes(studentId) {
      return [...effectiveScopes(await deps.consent.listByStudent(studentId))];
    },
  };
}
