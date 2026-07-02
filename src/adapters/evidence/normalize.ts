import { z } from "zod";

import {
  createAssessment,
  createOutcome,
  UNTAGGED_SKILL_ID,
  type Assessment,
  type AssessmentItem,
  type EvidenceTotals,
  type Id,
  type ItemOutcome,
  type Outcome,
} from "@/domain";
import type { RawGradeRecord } from "@/domain/ports";

/**
 * The anti-corruption normalizer: RawGradeRecord → { Assessment,
 * AssessmentItem[], Outcome } through a Zod boundary. Pure functions — no I/O,
 * no clock, no randomness — so every messy-row rule is unit-testable.
 *
 * Malformed rows are QUARANTINED (collected with a reason and reported), never
 * thrown out of the pipeline. Partial rows degrade honestly: incomplete item
 * detail falls back to the assignment total when one exists; missing skill
 * tags fall back to an optional deterministic tagger and then to the
 * UNTAGGED sentinel. Correctness may be derived from points (full credit =
 * correct) but is never guessed.
 */

/** Deterministic Id for the outcome a grade row maps to — the idempotency key. */
export function evidenceOutcomeId(assessmentRef: Id, studentId: Id): Id {
  return `out-${assessmentRef}-${studentId}`;
}

/**
 * Optional skill-tagging labor (e.g. the LanguageCapability). Deterministic
 * default is NO tagger: untagged items keep the sentinel and the pipeline
 * still works (globalGap-only). Never used for eligibility or calibration.
 */
export type SkillTagger = (prompt: string) => Id | null;

export interface NormalizedEvidence {
  assessment: Assessment;
  items: AssessmentItem[];
  outcome: Outcome;
  totals: EvidenceTotals | null;
  studentId: Id;
  revision: number;
  /** Degradations and repairs applied, surfaced rather than silent. */
  notes: string[];
}

export interface QuarantinedRecord {
  record: RawGradeRecord;
  reason: string;
}

export interface NormalizationResult {
  /** Ordered by recordedAt then revision, so revisions apply last. */
  normalized: NormalizedEvidence[];
  quarantined: QuarantinedRecord[];
}

// --- The Zod boundary ---------------------------------------------------------

const rawGradeItemSchema = z.object({
  itemRef: z.string().min(1).optional(),
  skillTag: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  correct: z.boolean().optional(),
  pointsAwarded: z.number().finite().nonnegative().optional(),
  maxPoints: z.number().finite().positive().optional(),
});

const rawGradeRecordSchema = z.object({
  externalId: z.string().min(1).optional(),
  studentId: z.string().min(1),
  assessmentRef: z.string().min(1),
  assessmentTitle: z.string().min(1).optional(),
  totalScore: z.number().finite().nonnegative().optional(),
  totalMax: z.number().finite().positive().optional(),
  recordedAt: z.union([z.string().min(1), z.date()]),
  revision: z.number().int().positive().optional(),
  status: z.string().min(1).optional(),
  items: z.array(rawGradeItemSchema).optional(),
});

type ParsedRecord = z.infer<typeof rawGradeRecordSchema>;
type ParsedItem = z.infer<typeof rawGradeItemSchema>;

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

// --- Per-record normalization ---------------------------------------------------

type NormalizeOneResult =
  | { ok: true; evidence: NormalizedEvidence }
  | { ok: false; reason: string };

interface BuiltItem {
  item: AssessmentItem;
  itemOutcome: ItemOutcome;
}

/** Full credit = correct; anything less needs an explicit `correct` flag. */
function deriveCorrect(item: ParsedItem): boolean | undefined {
  if (item.correct !== undefined) return item.correct;
  if (item.pointsAwarded !== undefined && item.maxPoints !== undefined) {
    return item.pointsAwarded >= item.maxPoints;
  }
  return undefined;
}

function buildItems(
  raw: ParsedRecord,
  notes: string[],
  tagger: SkillTagger | undefined,
): { built: BuiltItem[]; problems: string[] } {
  const built: BuiltItem[] = [];
  const problems: string[] = [];
  const rawItems = raw.items ?? [];

  rawItems.forEach((rawItem, index) => {
    const label = `item ${index + 1}`;
    const correct = deriveCorrect(rawItem);
    if (correct === undefined) {
      problems.push(`${label} has neither correctness nor points`);
      return;
    }

    const itemId = rawItem.itemRef ?? `${raw.assessmentRef}:item-${index + 1}`;
    if (rawItem.itemRef === undefined) {
      notes.push(`${label}: itemRef missing; synthesized "${itemId}"`);
    }

    let skillId: Id | undefined = rawItem.skillTag;
    if (skillId === undefined && rawItem.prompt !== undefined && tagger) {
      const inferred = tagger(rawItem.prompt);
      if (inferred !== null) {
        skillId = inferred;
        notes.push(`${label}: skill "${inferred}" inferred from prompt`);
      }
    }

    const maxPoints = rawItem.maxPoints ?? 1;
    built.push({
      item: {
        id: itemId,
        assessmentId: raw.assessmentRef,
        skillId: skillId ?? UNTAGGED_SKILL_ID,
        prompt: rawItem.prompt ?? `Item ${index + 1} (prompt not recorded)`,
        maxPoints,
      },
      itemOutcome: {
        itemId,
        correct,
        pointsAwarded: rawItem.pointsAwarded ?? (correct ? maxPoints : 0),
      },
    });
  });

  return { built, problems };
}

function normalizeOne(
  record: RawGradeRecord,
  tagger: SkillTagger | undefined,
): NormalizeOneResult {
  const parsed = rawGradeRecordSchema.safeParse(record);
  if (!parsed.success) {
    return { ok: false, reason: describeIssues(parsed.error) };
  }
  const raw = parsed.data;

  const scoredAt =
    raw.recordedAt instanceof Date ? raw.recordedAt : new Date(raw.recordedAt);
  if (Number.isNaN(scoredAt.getTime())) {
    return {
      ok: false,
      reason: `recordedAt "${String(raw.recordedAt)}" is not a parseable date`,
    };
  }

  const totals: EvidenceTotals | null =
    raw.totalScore !== undefined && raw.totalMax !== undefined
      ? { pointsAwarded: raw.totalScore, maxPoints: raw.totalMax }
      : null;
  if (totals !== null && totals.pointsAwarded > totals.maxPoints) {
    return { ok: false, reason: "totalScore exceeds totalMax" };
  }

  const notes: string[] = [];
  if (raw.status !== undefined && raw.status !== "final") {
    notes.push(`status: ${raw.status}`);
  }

  const hasRawItems = (raw.items?.length ?? 0) > 0;
  let domainItems: AssessmentItem[] = [];
  let itemOutcomes: ItemOutcome[] = [];

  if (hasRawItems) {
    const { built, problems } = buildItems(raw, notes, tagger);
    if (problems.length === 0) {
      domainItems = built.map((b) => b.item);
      itemOutcomes = built.map((b) => b.itemOutcome);
    } else if (totals !== null) {
      // Partial row: item detail is unusable but the total is real. Degrade —
      // and say so — instead of inventing item data or dropping the record.
      notes.push(
        `item detail incomplete (${problems.join("; ")}); degraded to assignment total`,
      );
    } else {
      return {
        ok: false,
        reason: `item detail incomplete and no assignment total: ${problems.join("; ")}`,
      };
    }
  } else if (totals === null) {
    return {
      ok: false,
      reason: "record has neither item detail nor an assignment total",
    };
  }

  try {
    const assessment = createAssessment({
      id: raw.assessmentRef,
      title: raw.assessmentTitle ?? `Assessment ${raw.assessmentRef}`,
      items: domainItems,
      createdAt: scoredAt,
    });
    const outcome = createOutcome({
      id: evidenceOutcomeId(raw.assessmentRef, raw.studentId),
      assessmentId: raw.assessmentRef,
      studentId: raw.studentId,
      itemOutcomes,
      scoredAt,
    });
    return {
      ok: true,
      evidence: {
        assessment,
        items: assessment.items,
        outcome,
        totals,
        studentId: raw.studentId,
        revision: raw.revision ?? 1,
        notes,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Normalizes a batch. Never throws: every malformed record lands in
 * `quarantined` with its reason and the rest of the batch proceeds.
 */
export function normalizeRecords(
  records: readonly RawGradeRecord[],
  options: { tagger?: SkillTagger } = {},
): NormalizationResult {
  const normalized: NormalizedEvidence[] = [];
  const quarantined: QuarantinedRecord[] = [];
  for (const record of records) {
    const result = normalizeOne(record, options.tagger);
    if (result.ok) {
      normalized.push(result.evidence);
    } else {
      quarantined.push({ record, reason: result.reason });
    }
  }
  normalized.sort(
    (a, b) =>
      a.outcome.scoredAt.getTime() - b.outcome.scoredAt.getTime() ||
      a.revision - b.revision,
  );
  return { normalized, quarantined };
}
