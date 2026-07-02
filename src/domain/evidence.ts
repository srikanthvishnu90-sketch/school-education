import { z } from "zod";
import { DomainError, type Id } from "./common";

/**
 * The universal connector contract. The domain speaks ONE evidence language —
 * CanonicalEvidence — and every external provider ships a thin translator into
 * it (CLAUDE.md → "AI = labor, not judgment": a vendor map is labor; the
 * canonical shape, its versioning, and eligibility stay deterministic). A new
 * provider is a new adapter and ZERO domain change.
 *
 * CanonicalEvidence carries an explicit `schemaVersion`. A payload at a KNOWN
 * older version is migrated; a payload at an unknown version is QUARANTINED —
 * a foreign shape is never silently accepted.
 */

/** The version of CanonicalEvidence this build speaks. Bump on any shape change. */
export const EVIDENCE_SCHEMA_VERSION = 2;

/**
 * What a provider DECLARES it can supply — the upper bound on what the P6
 * eligibility gate may compute for its evidence. Declared, never discovered: a
 * provider that says `itemLevel: false` gets globalGap only, even if a stray row
 * carried item detail.
 */
export interface ProviderCapabilities {
  /** Per-item correctness is available (enables item/full calibration). */
  itemLevel: boolean;
  /** Items carry skill/standard tags (enables the per-skill breakdown). */
  skillTags: boolean;
  /** Attendance is supplied alongside grades. */
  attendance: boolean;
}

export interface Attendance {
  present: boolean;
  minutesLate?: number;
}

export interface CanonicalItem {
  itemRef: string;
  skillTag?: string;
  prompt?: string;
  correct?: boolean;
  pointsAwarded?: number;
  maxPoints?: number;
}

export interface CanonicalEvidence {
  schemaVersion: number;
  studentId: string;
  assessmentRef: string;
  assessmentTitle?: string;
  /** Sources emit strings as often as dates; the normalizer parses/quarantines. */
  recordedAt: string | Date;
  revision?: number;
  status?: string;
  totalScore?: number;
  totalMax?: number;
  items?: CanonicalItem[];
  attendance?: Attendance;
}

// --- The versioned Zod boundary ----------------------------------------------

const canonicalItemSchema = z.object({
  itemRef: z.string().min(1),
  skillTag: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  correct: z.boolean().optional(),
  pointsAwarded: z.number().finite().nonnegative().optional(),
  maxPoints: z.number().finite().positive().optional(),
});

const attendanceSchema = z.object({
  present: z.boolean(),
  minutesLate: z.number().finite().nonnegative().optional(),
});

const canonicalEvidenceSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
  studentId: z.string().min(1),
  assessmentRef: z.string().min(1),
  assessmentTitle: z.string().min(1).optional(),
  recordedAt: z.union([z.string().min(1), z.date()]),
  revision: z.number().int().positive().optional(),
  status: z.string().min(1).optional(),
  totalScore: z.number().finite().nonnegative().optional(),
  totalMax: z.number().finite().positive().optional(),
  items: z.array(canonicalItemSchema).optional(),
  attendance: attendanceSchema.optional(),
});

export type ReceiveResult =
  | { ok: true; evidence: CanonicalEvidence }
  | { ok: false; reason: string };

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * v1 → v2 migration. v1 tagged items with `standardTag` and had no attendance;
 * v2 renames the tag to `skillTag`. Operates on an untrusted object and hands
 * the result to the current-version validator, so a "migrated" row that is still
 * malformed is quarantined like any other.
 */
function migrateV1toV2(raw: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => {
        if (item === null || typeof item !== "object") return item;
        const { standardTag, ...rest } = item as Record<string, unknown>;
        return standardTag !== undefined
          ? { ...rest, skillTag: standardTag }
          : rest;
      })
    : raw.items;
  return { ...raw, items, schemaVersion: EVIDENCE_SCHEMA_VERSION };
}

/**
 * The versioned gate every canonical payload passes: migrate a known older
 * version, validate the current one, and quarantine anything else. This is the
 * ONLY sanctioned way to admit a CanonicalEvidence from outside — a foreign
 * shape or an unknown version is refused with a reason, never silently accepted.
 */
export function receiveCanonical(raw: unknown): ReceiveResult {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "evidence is not an object" };
  }
  const version = (raw as Record<string, unknown>).schemaVersion;
  if (typeof version !== "number") {
    return { ok: false, reason: "missing or non-numeric schemaVersion" };
  }

  let candidate: unknown = raw;
  if (version !== EVIDENCE_SCHEMA_VERSION) {
    if (version === 1) {
      candidate = migrateV1toV2(raw as Record<string, unknown>);
    } else {
      return {
        ok: false,
        reason: `unknown schemaVersion ${version}; refusing to accept a foreign shape`,
      };
    }
  }

  const parsed = canonicalEvidenceSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: describeIssues(parsed.error) };
  }
  return { ok: true, evidence: parsed.data };
}

// --- Field maps (vendor field → canonical field) -----------------------------

/**
 * A provider's translation table. Until CONFIRMED it is structurally unusable —
 * a provider must refuse to normalize under a 'proposed' map (auto-applying a
 * proposed map is out of scope). A LanguageCapability may PROPOSE mappings
 * (labor); confirmation is a deterministic/human step.
 */
export interface FieldMap {
  providerId: Id;
  /** Native field name → canonical field name. */
  mappings: Record<string, string>;
  status: "proposed" | "confirmed";
}

export function isFieldMapUsable(map: FieldMap): boolean {
  return map.status === "confirmed";
}

/** The deterministic/human confirmation step. Never auto-invoked by a proposer. */
export function confirmFieldMap(map: FieldMap): FieldMap {
  return { ...map, status: "confirmed" };
}

/** Raised when a provider is asked to pull under an unconfirmed field map. */
export class UnconfirmedFieldMapError extends DomainError {
  constructor(providerId: Id) {
    super(
      `provider ${providerId} cannot normalize under a 'proposed' field map; confirm it first`,
    );
    this.name = "UnconfirmedFieldMapError";
  }
}

/** Refuse the pull unless the map is confirmed. Providers call this first. */
export function assertFieldMapUsable(map: FieldMap): void {
  if (!isFieldMapUsable(map)) {
    throw new UnconfirmedFieldMapError(map.providerId);
  }
}

/**
 * Renames native keys to canonical keys per a field map. Native keys with no
 * mapping are dropped (a canonical field never comes from an unmapped source);
 * undefined native values are skipped.
 */
export function remap(
  native: Record<string, unknown>,
  mappings: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(mappings)) {
    if (native[from] !== undefined) out[to] = native[from];
  }
  return out;
}
