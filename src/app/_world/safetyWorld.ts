import {
  cipherKeyFromHex,
  createAesCipher,
  createCrisisEscalationRepository,
  createCrisisSafetyService,
  createPgCrisisEscalationRepository,
  createTenantProtocolRepository,
  detectCrisis,
  type CrisisEscalationRepository,
  type CrisisSafetyService,
} from "@/safety";
import { createPgClient, runMigrations, applyRls } from "@/adapters/supabase";
import {
  createEmailCrisisDeliveryChannel,
  createEmailOperatorChannel,
} from "./safetyChannels";
import { assertProductionConfig, isProduction } from "./productionConfig";
import { DEMO_TENANT_ID } from "./credentials";
import { COUNSELOR_ID } from "./roles";

/**
 * A boolean-only safety check the reflection engine uses to yield to a concern.
 * It exposes NO escalation data — just whether the deterministic detector fired —
 * so the isolation holds: the reflection flow learns "stop and route to a human",
 * never anything about the crisis itself.
 */
export function isSafetyConcern(text: string): boolean {
  return detectCrisis(text) !== null;
}

/**
 * The process-lifetime crisis safety world (P16). This is one of the TWO sanctioned
 * importers of src/safety — the capture boundary (safetyActions) and the counselor
 * surface (counselorActions) both build on it. Keeping the escalation repo here,
 * shared, lets the counselor READ what the capture boundary WROTE without either
 * surface reaching into the other.
 *
 * In production the cipher key comes from a KMS and the channels are real; here
 * they are in-memory with an audit trail.
 */

const DEV_KEY_HEX =
  process.env.CRISIS_KEY_HEX ??
  "0000000000000000000000000000000000000000000000000000000000000000";

export interface SafetyWorld {
  service: CrisisSafetyService;
  escalations: CrisisEscalationRepository;
}

let safetyPromise: Promise<SafetyWorld> | null = null;

export function getSafetyWorld(): Promise<SafetyWorld> {
  if (safetyPromise === null) {
    safetyPromise = (async () => {
      // The crisis path is a composition root of its own — enforce prod config here
      // too, so a misconfigured deployment can't quietly screen students.
      assertProductionConfig();
      // Persistence by default: PG-backed escalations when a database is configured
      // (so escalations + retry state survive restarts), else in-memory.
      let escalations: CrisisEscalationRepository;
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl !== undefined && dbUrl.length > 0) {
        const client = createPgClient(dbUrl);
        await runMigrations(client);
        await applyRls(client);
        escalations = createPgCrisisEscalationRepository(client);
      } else {
        escalations = createCrisisEscalationRepository();
      }
      const protocols = createTenantProtocolRepository();
      // Demo counselor protocol — DEV/TEST ONLY. In production each tenant supplies
      // its own designated contact; a tenant with none configured routes to the
      // operator fallback (never a silent drop). A demo contact must NEVER be seeded
      // into production.
      if (!isProduction()) {
        await protocols.save({
          tenantId: DEMO_TENANT_ID,
          contacts: [
            { id: COUNSELOR_ID, role: "counselor", handle: "okafor@demo.school" },
          ],
          channel: "operator-console",
        });
      }
      let seq = 0;
      const service = createCrisisSafetyService({
        now: () => new Date(),
        nextId: () => `esc-${++seq}-${Date.now()}`,
        cipher: createAesCipher(cipherKeyFromHex(DEV_KEY_HEX)),
        escalations,
        protocols,
        // Active notification: email the designated counselor (Resend when
        // configured), with the operator as the last-resort fallback.
        delivery: createEmailCrisisDeliveryChannel(),
        operator: createEmailOperatorChannel(),
      });
      return { service, escalations };
    })();
  }
  return safetyPromise;
}
