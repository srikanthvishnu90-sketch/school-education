import {
  assessEvidence,
  receiveCanonical,
  type Attendance,
  type CanonicalEvidence,
  type EligibilityDecision,
  type EvidenceCalibration,
  type FieldMap,
  type Id,
  type Prediction,
  type ProviderCapabilities,
} from "@/domain";
import type {
  EvidenceProvider,
  LanguageCapability,
  RawGradeRecord,
} from "@/domain/ports";
import { normalizeRecords } from "@/adapters/evidence/normalize";

/**
 * The connector — the seam between the provider layer and the P6 pipeline. It
 * pulls canonical evidence, re-checks its version at the boundary (migrate a
 * known version, quarantine an unknown one), and runs the EXISTING normalizer +
 * eligibility gate. The only new judgment is capability-gating: a provider's
 * declared capabilities cap what the gate may compute. No domain/service code
 * changes when the selected provider changes.
 */

export interface ProviderPull {
  providerId: Id;
  capabilities: ProviderCapabilities;
  evidence: CanonicalEvidence[];
  quarantined: { reason: string; raw: unknown }[];
}

/**
 * Pull from a provider and admit each row through the versioned canonical gate.
 * A row that fails the gate (unknown version, foreign shape) is quarantined with
 * a reason — never silently accepted.
 */
export async function receiveFromProvider(
  provider: EvidenceProvider,
  studentId: Id,
  since?: Date,
): Promise<ProviderPull> {
  const rows = await provider.pull(studentId, since);
  const evidence: CanonicalEvidence[] = [];
  const quarantined: { reason: string; raw: unknown }[] = [];
  for (const row of rows) {
    const result = receiveCanonical(row);
    if (result.ok) evidence.push(result.evidence);
    else quarantined.push({ reason: result.reason, raw: row });
  }
  return {
    providerId: provider.id,
    capabilities: provider.capabilities(),
    evidence,
    quarantined,
  };
}

function canonicalToRaw(evidence: CanonicalEvidence): RawGradeRecord {
  return {
    studentId: evidence.studentId,
    assessmentRef: evidence.assessmentRef,
    assessmentTitle: evidence.assessmentTitle,
    totalScore: evidence.totalScore,
    totalMax: evidence.totalMax,
    recordedAt: evidence.recordedAt,
    revision: evidence.revision,
    status: evidence.status,
    items: evidence.items?.map((item) => ({
      itemRef: item.itemRef,
      skillTag: item.skillTag,
      prompt: item.prompt,
      correct: item.correct,
      pointsAwarded: item.pointsAwarded,
      maxPoints: item.maxPoints,
    })),
  };
}

export interface CanonicalEvaluation {
  studentId: Id;
  assessmentRef: Id;
  eligibility: EligibilityDecision;
  /** Null for baseline evidence (no calibration ran). */
  calibration: EvidenceCalibration | null;
  attendance?: Attendance;
  notes: string[];
}

export type EvaluateResult =
  | { ok: true; evaluation: CanonicalEvaluation }
  | { ok: false; reason: string };

/**
 * Normalize one canonical evidence through the P6 boundary and gate its
 * eligibility against the provider's declared capabilities. The same function
 * serves every provider — item-level evidence yields a per-skill breakdown,
 * total-only evidence yields globalGap only, decided by the flags, not the shape.
 */
export function evaluateCanonical(
  evidence: CanonicalEvidence,
  prediction: Prediction | null,
  capabilities: ProviderCapabilities,
): EvaluateResult {
  const { normalized, quarantined } = normalizeRecords([canonicalToRaw(evidence)]);
  if (normalized.length === 0) {
    return {
      ok: false,
      reason: quarantined[0]?.reason ?? "canonical evidence failed normalization",
    };
  }
  const one = normalized[0];
  const { decision, calibration } = assessEvidence(
    {
      prediction,
      outcome: one.outcome,
      items: one.items,
      totals: one.totals,
    },
    capabilities,
  );
  return {
    ok: true,
    evaluation: {
      studentId: one.studentId,
      assessmentRef: one.assessment.id,
      eligibility: decision,
      calibration,
      attendance: evidence.attendance,
      notes: one.notes,
    },
  };
}

// --- Field-map proposal (labor; never auto-confirmed) ------------------------

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchField(
  native: string,
  canonicalFields: readonly string[],
  language: LanguageCapability | undefined,
): string | null {
  const target = normalizeName(native);
  for (const canonical of canonicalFields) {
    if (normalizeName(canonical) === target) return canonical;
  }
  if (language !== undefined) {
    const tagged = language.tagSkills(
      native,
      canonicalFields.map((field) => ({ id: field, name: field })),
    );
    if (tagged.length > 0) return tagged[0];
  }
  return null;
}

/**
 * PROPOSES a field map (labor) — deterministic name matching by default, with an
 * optional LanguageCapability as a fuzzy fallback. The result is always
 * 'proposed': confirmation is a separate deterministic/human step, and
 * auto-applying a proposed map is out of scope.
 */
export function proposeFieldMap(
  providerId: Id,
  nativeFields: readonly string[],
  canonicalFields: readonly string[],
  language?: LanguageCapability,
): FieldMap {
  const mappings: Record<string, string> = {};
  // A canonical target may be claimed once. If two native fields match the same
  // target, the first (in order) wins and the second is left unmapped for the
  // human confirmation step to resolve — never a silent last-writer overwrite.
  const claimed = new Set<string>();
  for (const native of nativeFields) {
    const match = matchField(native, canonicalFields, language);
    if (match !== null && !claimed.has(match)) {
      mappings[native] = match;
      claimed.add(match);
    }
  }
  return { providerId, mappings, status: "proposed" };
}
