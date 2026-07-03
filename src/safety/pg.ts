import type { SqlClient } from "@/adapters/supabase";
import type { CrisisEscalation } from "./escalation";
import type { CrisisEscalationRepository } from "./ports";

/**
 * Postgres-backed crisis escalation store (P16), so escalations and their
 * unacknowledged-retry state survive restarts. Lives INSIDE the safety module, so
 * the isolation boundary is unchanged (only safetyWorld imports the module). The
 * row is written as explicit columns — the same shape the RLS policy reads, so the
 * counselor's DB-enforced access applies to real rows.
 */

type EscalationRow = {
  id: string;
  student_id: string;
  tenant_id: string;
  tier: string;
  text_ref: string;
  detector_version: string;
  created_at: Date;
  delivered_to: string[];
  delivered_at: Date | null;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  undelivered: boolean;
  attempts: number;
  last_attempt_at: Date | null;
};

function toEntity(row: EscalationRow): CrisisEscalation {
  return {
    id: row.id,
    studentId: row.student_id,
    tenantId: row.tenant_id,
    tier: row.tier as CrisisEscalation["tier"],
    textRef: row.text_ref,
    detectorVersion: row.detector_version,
    createdAt: row.created_at,
    deliveredTo: row.delivered_to,
    deliveredAt: row.delivered_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    undelivered: row.undelivered,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at ?? row.created_at,
  };
}

const COLUMNS =
  "id, student_id, tenant_id, tier, text_ref, detector_version, created_at, " +
  "delivered_to, delivered_at, acknowledged_at, acknowledged_by, undelivered, " +
  "attempts, last_attempt_at";

export function createPgCrisisEscalationRepository(
  client: SqlClient,
): CrisisEscalationRepository {
  return {
    async save(e) {
      await client.query(
        `insert into safety.crisis_escalations
          (id, student_id, tenant_id, tier, text_ref, detector_version, created_at,
           delivered_to, delivered_at, acknowledged_at, acknowledged_by, undelivered,
           attempts, last_attempt_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (id) do update set
           delivered_to = excluded.delivered_to,
           delivered_at = excluded.delivered_at,
           acknowledged_at = excluded.acknowledged_at,
           acknowledged_by = excluded.acknowledged_by,
           undelivered = excluded.undelivered,
           attempts = excluded.attempts,
           last_attempt_at = excluded.last_attempt_at`,
        [
          e.id,
          e.studentId,
          e.tenantId,
          e.tier,
          e.textRef,
          e.detectorVersion,
          e.createdAt,
          JSON.stringify(e.deliveredTo),
          e.deliveredAt,
          e.acknowledgedAt,
          e.acknowledgedBy,
          e.undelivered,
          e.attempts,
          e.lastAttemptAt,
        ],
      );
    },
    async findById(id) {
      const { rows } = await client.query<EscalationRow>(
        `select ${COLUMNS} from safety.crisis_escalations where id = $1`,
        [id],
      );
      return rows.length > 0 ? toEntity(rows[0]) : null;
    },
    async listPending() {
      const { rows } = await client.query<EscalationRow>(
        `select ${COLUMNS} from safety.crisis_escalations ` +
          `where acknowledged_at is null order by created_at asc`,
      );
      return rows.map(toEntity);
    },
    async listByTenant(tenantId) {
      const { rows } = await client.query<EscalationRow>(
        `select ${COLUMNS} from safety.crisis_escalations ` +
          `where tenant_id = $1 order by created_at asc`,
        [tenantId],
      );
      return rows.map(toEntity);
    },
  };
}
