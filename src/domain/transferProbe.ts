import type { Id } from "./common";
import { transferProbeSchema } from "./schemas/academic";

/**
 * TransferProbe → a fresh item served after the student says "I get it now", to
 * test REAL transfer against the fluency illusion. Shape only here; the serving
 * logic is a later phase.
 */
export interface TransferProbe {
  id: Id;
  assessmentId: Id;
  skillId: Id;
  itemId: Id;
  createdAt: Date;
}

export function createTransferProbe(input: TransferProbe): TransferProbe {
  return Object.freeze(transferProbeSchema.parse(input));
}
