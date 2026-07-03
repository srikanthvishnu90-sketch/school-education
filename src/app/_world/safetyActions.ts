"use server";

import {
  cipherKeyFromHex,
  createAesCipher,
  createCrisisEscalationRepository,
  createCrisisSafetyService,
  createRecordingDeliveryChannel,
  createRecordingOperatorChannel,
  createTenantProtocolRepository,
  type CrisisSafetyService,
} from "@/safety";
import { getSessionStudent } from "./session";

/**
 * The crisis capture boundary — the ONLY place outside src/safety that imports it.
 * Free text submitted by a student is screened here; a hit routes to humans and
 * tells the surface to show the resource screen. This is the sanctioned exception
 * to "data flows to the student" (P16), and it NEVER consults consent.
 *
 * The process-lifetime safety world is seeded with a tenant protocol so the demo
 * delivers to a designated counselor. In production the key comes from a KMS and
 * the channels are real; here they are in-memory with an audit trail.
 */

const DEFAULT_TENANT = "school-1";
// A dev-only key; production injects a real 32-byte key from a KMS / env.
const DEV_KEY_HEX =
  process.env.CRISIS_KEY_HEX ??
  "0000000000000000000000000000000000000000000000000000000000000000";

let safetyPromise: Promise<CrisisSafetyService> | null = null;

async function getSafety(): Promise<CrisisSafetyService> {
  if (safetyPromise === null) {
    safetyPromise = (async () => {
      const protocols = createTenantProtocolRepository();
      await protocols.save({
        tenantId: DEFAULT_TENANT,
        contacts: [
          { id: "counselor-1", role: "counselor", handle: "counselor@demo.school" },
        ],
        channel: "operator-console",
      });
      let seq = 0;
      return createCrisisSafetyService({
        now: () => new Date(),
        nextId: () => `esc-${++seq}-${Date.now()}`,
        cipher: createAesCipher(cipherKeyFromHex(DEV_KEY_HEX)),
        escalations: createCrisisEscalationRepository(),
        protocols,
        delivery: createRecordingDeliveryChannel(),
        operator: createRecordingOperatorChannel(),
      });
    })();
  }
  return safetyPromise;
}

/**
 * Screen a piece of free text at capture. Returns whether a crisis signal was
 * found (so the surface can show the calm resource screen). The escalation is
 * created and routed server-side; the client learns only the boolean.
 */
export async function screenReflectionText(
  text: string,
): Promise<{ crisis: boolean }> {
  const studentId = await getSessionStudent();
  if (studentId === null || text.trim().length === 0) {
    return { crisis: false };
  }
  const safety = await getSafety();
  const result = await safety.screen({
    studentId,
    tenantId: DEFAULT_TENANT,
    text,
  });
  return { crisis: result.detected !== null };
}
