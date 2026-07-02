import {
  EVIDENCE_SCHEMA_VERSION,
  assertFieldMapUsable,
  receiveCanonical,
  remap,
  type CanonicalEvidence,
  type CanonicalItem,
  type FieldMap,
} from "@/domain";
import type { EvidenceProvider } from "@/domain/ports";

/**
 * Two mock EvidenceProviders with DIFFERENT native shapes and capabilities,
 * proving the domain is untouched across both. Neither makes a live vendor call;
 * each is a thin translator that:
 *   1. refuses to pull under an unconfirmed field map,
 *   2. remaps its native identity fields via the map,
 *   3. builds canonical items/totals/attendance from its own structure,
 *   4. validates through receiveCanonical before emitting — a native row that
 *      cannot become valid canonical is quarantined (absent from the output).
 */

// --- Provider A: QuizWorld — item-level, skill-tagged, no attendance ----------

export const QUIZWORLD_PROVIDER_ID = "provider-quizworld";

export interface QuizWorldQuestion {
  qid: string;
  standard?: string;
  text?: string;
  score: number;
  outOf: number;
}

export interface QuizWorldRow {
  learner: string;
  quizId: string;
  quizName?: string;
  ts: string | Date;
  attempt?: number;
  state?: string;
  questions: QuizWorldQuestion[];
}

export function quizWorldFieldMap(
  status: FieldMap["status"] = "confirmed",
): FieldMap {
  return {
    providerId: QUIZWORLD_PROVIDER_ID,
    mappings: {
      learner: "studentId",
      quizId: "assessmentRef",
      quizName: "assessmentTitle",
      ts: "recordedAt",
      attempt: "revision",
      state: "status",
    },
    status,
  };
}

/** Translate native questions to canonical items, or null if any is unusable. */
function translateQuestions(
  questions: readonly QuizWorldQuestion[],
): CanonicalItem[] | null {
  const items: CanonicalItem[] = [];
  for (const q of questions) {
    if (typeof q.qid !== "string" || q.qid.length === 0) return null;
    if (
      typeof q.score !== "number" ||
      typeof q.outOf !== "number" ||
      q.outOf <= 0
    ) {
      return null;
    }
    items.push({
      itemRef: q.qid,
      skillTag: q.standard,
      prompt: q.text,
      correct: q.score >= q.outOf,
      pointsAwarded: q.score,
      maxPoints: q.outOf,
    });
  }
  return items;
}

export function createItemLevelMockProvider(opts: {
  rows: readonly QuizWorldRow[];
  fieldMap: FieldMap;
}): EvidenceProvider {
  const { rows, fieldMap } = opts;
  return {
    id: QUIZWORLD_PROVIDER_ID,
    capabilities: () => ({ itemLevel: true, skillTags: true, attendance: false }),
    async pull(studentId, since) {
      assertFieldMapUsable(fieldMap);
      const out: CanonicalEvidence[] = [];
      for (const row of rows) {
        if (row.learner !== studentId) continue;
        if (!withinSince(row.ts, since)) continue;

        const items = translateQuestions(row.questions);
        if (items === null) continue; // malformed item detail → quarantine
        const top = remap(
          row as unknown as Record<string, unknown>,
          fieldMap.mappings,
        );
        const result = receiveCanonical({
          schemaVersion: EVIDENCE_SCHEMA_VERSION,
          ...top,
          items,
        });
        if (result.ok) out.push(result.evidence);
      }
      return out;
    },
  };
}

// --- Provider B: LedgerLMS — total-only, no skill tags, with attendance -------

export const LEDGER_PROVIDER_ID = "provider-ledgerlms";

export interface LedgerRow {
  sid: string;
  course: string;
  label?: string;
  recorded: string | Date;
  earned: number;
  possible: number;
  attended: boolean;
  tardyMinutes?: number;
}

export function ledgerFieldMap(
  status: FieldMap["status"] = "confirmed",
): FieldMap {
  return {
    providerId: LEDGER_PROVIDER_ID,
    mappings: {
      sid: "studentId",
      course: "assessmentRef",
      label: "assessmentTitle",
      recorded: "recordedAt",
      earned: "totalScore",
      possible: "totalMax",
    },
    status,
  };
}

export function createTotalOnlyMockProvider(opts: {
  rows: readonly LedgerRow[];
  fieldMap: FieldMap;
}): EvidenceProvider {
  const { rows, fieldMap } = opts;
  return {
    id: LEDGER_PROVIDER_ID,
    capabilities: () => ({ itemLevel: false, skillTags: false, attendance: true }),
    async pull(studentId, since) {
      assertFieldMapUsable(fieldMap);
      const out: CanonicalEvidence[] = [];
      for (const row of rows) {
        if (row.sid !== studentId) continue;
        if (!withinSince(row.recorded, since)) continue;

        const top = remap(
          row as unknown as Record<string, unknown>,
          fieldMap.mappings,
        );
        const attendance =
          typeof row.attended === "boolean"
            ? { present: row.attended, minutesLate: row.tardyMinutes }
            : undefined;
        const result = receiveCanonical({
          schemaVersion: EVIDENCE_SCHEMA_VERSION,
          ...top,
          attendance,
        });
        if (result.ok) out.push(result.evidence);
      }
      return out;
    },
  };
}

/**
 * `since` filter shared by both mocks. An unparseable timestamp is not honestly
 * excludable by `since`, so it is passed through unchanged (never silently
 * dropped here). The canonical gate accepts any non-empty date string; the
 * downstream P6 normalizer is the date authority and quarantines it there —
 * consistent with the EvidenceSource contract.
 */
function withinSince(raw: string | Date, since?: Date): boolean {
  if (since === undefined) return true;
  const at = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(at.getTime()) || at.getTime() > since.getTime();
}
