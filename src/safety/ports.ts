import type { CrisisEscalation, DeliveryUrgency } from "./escalation";
import type { CrisisTier } from "./detector";

/**
 * The driven ports of the safety module. Everything the crisis path touches —
 * persistence, tenant protocol, human delivery, the operator alert channel, and
 * the cipher — is an interface here, so the service is testable with in-memory
 * fakes and no real messaging.
 */

export interface CrisisEscalationRepository {
  save(escalation: CrisisEscalation): Promise<void>;
  findById(id: string): Promise<CrisisEscalation | null>;
  /** Every escalation not yet acknowledged (the retry work-list). */
  listPending(): Promise<CrisisEscalation[]>;
  /** All escalations for a tenant (the counselor surface reads these under RLS). */
  listByTenant(tenantId: string): Promise<CrisisEscalation[]>;
}

/** A district-designated recipient. Counselors only — the sole role that may receive. */
export interface CrisisContact {
  id: string;
  role: "counselor";
  /** Channel-specific address (an inbox, a pager id, …). */
  handle: string;
}

/**
 * A tenant's crisis protocol: who is designated, and on which channel. Crisis
 * delivery IGNORES quiet hours by definition — there is no field to disable it.
 */
export interface TenantCrisisProtocol {
  tenantId: string;
  contacts: CrisisContact[];
  channel: string;
}

export interface TenantProtocolRepository {
  find(tenantId: string): Promise<TenantCrisisProtocol | null>;
  save(protocol: TenantCrisisProtocol): Promise<void>;
}

export interface DeliveryRequest {
  escalation: CrisisEscalation;
  contacts: CrisisContact[];
  tier: CrisisTier;
  urgency: DeliveryUrgency;
}

/** Delivers an escalation to the designated humans. The audit lives in the impl. */
export interface CrisisDeliveryChannel {
  deliver(request: DeliveryRequest): Promise<void>;
}

export interface OperatorAlert {
  escalationId: string;
  tenantId: string;
  reason: string;
  urgency: DeliveryUrgency;
  at: Date;
}

/** The last-resort channel: fires when an escalation cannot reach a designated contact. */
export interface OperatorAlertChannel {
  alert(alert: OperatorAlert): Promise<void>;
}

/** Seals student text so `textRef` is never stored in plaintext. */
export interface CrisisCipher {
  seal(plaintext: string): string;
  open(sealed: string): string;
}
