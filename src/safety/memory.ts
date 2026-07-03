import { isPending, type CrisisEscalation } from "./escalation";
import type {
  CrisisDeliveryChannel,
  CrisisEscalationRepository,
  DeliveryRequest,
  OperatorAlert,
  OperatorAlertChannel,
  TenantCrisisProtocol,
  TenantProtocolRepository,
} from "./ports";

/**
 * In-memory adapters for the safety module — the only infrastructure that exists
 * (CLAUDE.md). The delivery and operator channels keep an AUDIT LOG so tests (and,
 * in production, a real channel) can prove a crisis was routed, never dropped.
 */

export function createCrisisEscalationRepository(): CrisisEscalationRepository {
  const byId = new Map<string, CrisisEscalation>();
  return {
    async save(escalation) {
      byId.set(escalation.id, escalation);
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async listPending() {
      return [...byId.values()].filter(isPending);
    },
    async listByTenant(tenantId) {
      return [...byId.values()].filter((e) => e.tenantId === tenantId);
    },
  };
}

export function createTenantProtocolRepository(): TenantProtocolRepository {
  const byTenant = new Map<string, TenantCrisisProtocol>();
  return {
    async find(tenantId) {
      return byTenant.get(tenantId) ?? null;
    },
    async save(protocol) {
      byTenant.set(protocol.tenantId, protocol);
    },
  };
}

export interface RecordingDeliveryChannel extends CrisisDeliveryChannel {
  /** The audit trail of what was delivered to whom, at which urgency. */
  log(): readonly DeliveryRequest[];
}

export function createRecordingDeliveryChannel(): RecordingDeliveryChannel {
  const entries: DeliveryRequest[] = [];
  return {
    async deliver(request) {
      entries.push(request);
    },
    log: () => entries,
  };
}

export interface RecordingOperatorChannel extends OperatorAlertChannel {
  log(): readonly OperatorAlert[];
}

export function createRecordingOperatorChannel(): RecordingOperatorChannel {
  const entries: OperatorAlert[] = [];
  return {
    async alert(alert) {
      entries.push(alert);
    },
    log: () => entries,
  };
}
