import {
  assessEvidence,
  createReflection,
  type EligibilityDecision,
  type EvidenceCalibration,
  type Id,
  type Outcome,
} from "@/domain";
import type {
  AssessmentRepository,
  EvidenceSource,
  LanguageCapability,
  OutcomeRepository,
  PredictionRepository,
  ReflectionRepository,
  SkillRef,
} from "@/domain/ports";
import {
  normalizeRecords,
  type QuarantinedRecord,
  type SkillTagger,
} from "@/adapters/evidence/normalize";

/**
 * Evidence ingestion — pull raw grade records through the EvidenceSource port,
 * normalize them at the Zod boundary, gate calibration-eligibility
 * DETERMINISTICALLY (domain/gap/eligibility), and reconcile the repositories.
 *
 * Division of labor (CLAUDE.md → "AI = labor, not judgment"): the optional
 * LanguageCapability only TAGS untagged items from their prompts; eligibility
 * and calibration never touch it. With no capability (or zero tags) the whole
 * pipeline still works — globalGap-only.
 *
 * Sync is IDEMPOTENT: a grade row maps to a deterministic outcome id, so
 * re-ingesting the same row overwrites in place with no side effects, and a
 * REVISED row updates the outcome. Reflections built on the superseded value
 * are flagged `stale` — never silently overwritten or deleted.
 */

export interface EvidenceIngestionDeps {
  source: EvidenceSource;
  assessments: AssessmentRepository;
  predictions: PredictionRepository;
  outcomes: OutcomeRepository;
  reflections: ReflectionRepository;
  /** Optional tagging labor for untagged items. Omit for the zero-tag default. */
  language?: LanguageCapability;
  /** The known skills the language capability may tag against. */
  skillCatalog?: readonly SkillRef[];
}

export interface IngestedEvidenceResult {
  assessmentId: Id;
  studentId: Id;
  outcomeId: Id;
  revision: number;
  /** True when this row REVISED an already-stored outcome. */
  updated: boolean;
  /** Reflections flagged stale because they were built on the old value. */
  staleReflectionIds: Id[];
  eligibility: EligibilityDecision;
  /** Null for baseline evidence (no calibration ran). */
  calibration: EvidenceCalibration | null;
  notes: string[];
}

export interface IngestReport {
  ingested: IngestedEvidenceResult[];
  quarantined: QuarantinedRecord[];
}

export interface EvidenceIngestion {
  /** Pull, normalize, gate, and reconcile all evidence for one student. */
  sync(studentId: Id, since?: Date): Promise<IngestReport>;
}

function sameItemOutcomes(a: Outcome, b: Outcome): boolean {
  if (a.itemOutcomes.length !== b.itemOutcomes.length) return false;
  return a.itemOutcomes.every((x, i) => {
    const y = b.itemOutcomes[i];
    return (
      x.itemId === y.itemId &&
      x.correct === y.correct &&
      x.pointsAwarded === y.pointsAwarded
    );
  });
}

/**
 * A stored outcome is revised when its item values changed. Total-only
 * outcomes carry no item values, so a new scoring time is the only honest
 * revision signal for them.
 */
function isRevision(existing: Outcome, next: Outcome): boolean {
  if (!sameItemOutcomes(existing, next)) return true;
  if (existing.itemOutcomes.length === 0) {
    return existing.scoredAt.getTime() !== next.scoredAt.getTime();
  }
  return false;
}

export function createEvidenceIngestion(
  deps: EvidenceIngestionDeps,
): EvidenceIngestion {
  const { language, skillCatalog } = deps;
  const tagger: SkillTagger | undefined =
    language !== undefined && skillCatalog !== undefined && skillCatalog.length > 0
      ? (prompt: string): Id | null =>
          language.tagSkills(prompt, skillCatalog)[0] ?? null
      : undefined;

  async function sync(studentId: Id, since?: Date): Promise<IngestReport> {
    const raw = await deps.source.pull(studentId, since);
    const { normalized, quarantined } = normalizeRecords(raw, { tagger });

    const ingested: IngestedEvidenceResult[] = [];
    for (const evidence of normalized) {
      // The teacher's existing assessment definition is authoritative; evidence
      // only creates a structure when none exists.
      const existingAssessment = await deps.assessments.findById(
        evidence.assessment.id,
      );
      if (existingAssessment === null) {
        await deps.assessments.save(evidence.assessment);
      }
      const items = existingAssessment?.items ?? evidence.items;

      const existingOutcome = await deps.outcomes.findById(evidence.outcome.id);
      // A row older than the stored outcome is SUPERSEDED evidence: report it,
      // but never let it clobber a newer revision (keeps re-syncs idempotent).
      const superseded =
        existingOutcome !== null &&
        existingOutcome.scoredAt.getTime() > evidence.outcome.scoredAt.getTime();
      const notes = superseded
        ? [...evidence.notes, "superseded by an already-stored newer outcome"]
        : evidence.notes;
      const updated =
        !superseded &&
        existingOutcome !== null &&
        isRevision(existingOutcome, evidence.outcome);
      if (!superseded) {
        await deps.outcomes.save(evidence.outcome);
      }

      let staleReflectionIds: Id[] = [];
      if (updated) {
        const built = (await deps.reflections.listByStudent(studentId)).filter(
          (r) =>
            r.assessmentId === evidence.assessment.id &&
            r.stale !== true &&
            r.createdAt.getTime() < evidence.outcome.scoredAt.getTime(),
        );
        for (const reflection of built) {
          await deps.reflections.save(
            createReflection({ ...reflection, stale: true }),
          );
        }
        staleReflectionIds = built.map((r) => r.id);
      }

      const prediction = await deps.predictions.findByAssessmentAndStudent(
        evidence.assessment.id,
        studentId,
      );
      const { decision, calibration } = assessEvidence({
        prediction,
        outcome: evidence.outcome,
        items,
        totals: evidence.totals,
      });

      ingested.push({
        assessmentId: evidence.assessment.id,
        studentId,
        outcomeId: evidence.outcome.id,
        revision: evidence.revision,
        updated,
        staleReflectionIds,
        eligibility: decision,
        calibration,
        notes,
      });
    }

    return { ingested, quarantined };
  }

  return { sync };
}
