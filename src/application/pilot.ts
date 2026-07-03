import {
  createPilotEvent,
  hasScope,
  type Id,
  type PilotEventType,
  type ScreenId,
} from "@/domain";
import type {
  Clock,
  ConsentRepository,
  PilotEventRepository,
  PseudonymRepository,
  ResponseQualityRepository,
} from "@/domain/ports";

/**
 * The pilot telemetry recorder (P17). It is the ONLY writer of pilot events, and
 * it enforces the two hard rules before anything is stored:
 *   1. Telemetry is a CONSENT SCOPE. No `telemetry` scope → zero events written.
 *   2. The student id is PSEUDONYMIZED via the separate table before storage.
 *
 * Events carry mechanics only (the closed `PilotEvent` shape guarantees no free
 * text); this service adds consent-gating and pseudonymization on top.
 */

export interface PilotTelemetryDeps {
  clock: Clock;
  consent: ConsentRepository;
  pseudonyms: PseudonymRepository;
  events: PilotEventRepository;
  /**
   * Response-quality store (P15). When provided, `noteQuarantine` reads it to emit
   * the `session_quarantined` MECHANIC (sanctioned for P17 pilot analysis by the
   * honesty doc). Keeping this read here keeps the ResponseQuality repo out of the
   * student surface entirely.
   */
  responseQuality?: ResponseQualityRepository;
}

export interface RecordPilotInput {
  /** The REAL student id — pseudonymized here before storage. */
  studentId: Id;
  tenantId: Id;
  type: PilotEventType;
  screenId?: ScreenId;
  latencyMs?: number;
  elapsedInCycleMs?: number;
  cycleN: number;
}

export interface QuarantineNote {
  studentId: Id;
  tenantId: Id;
  /** The capture session id (the prediction id) to look up in ResponseQuality. */
  sessionId: Id;
  cycleN: number;
}

export interface PilotTelemetry {
  /** Records an event iff telemetry consent is granted; a no-op otherwise. */
  record(input: RecordPilotInput): Promise<boolean>;
  /**
   * Emits `session_quarantined` iff the session was quarantined (P15) — the read
   * of ResponseQuality lives here, never on the student surface. No-op if no
   * ResponseQuality store is wired or the session wasn't quarantined.
   */
  noteQuarantine(input: QuarantineNote): Promise<boolean>;
}

export function createPilotTelemetry(
  deps: PilotTelemetryDeps,
): PilotTelemetry {
  async function record(input: RecordPilotInput): Promise<boolean> {
    const records = await deps.consent.listByStudent(input.studentId);
    if (!hasScope(records, "telemetry")) {
      return false; // no consent → zero events written
    }
    const studentId = await deps.pseudonyms.resolve(input.studentId);
    const event = createPilotEvent({
      studentId,
      tenantId: input.tenantId,
      type: input.type,
      ...(input.screenId !== undefined ? { screenId: input.screenId } : {}),
      ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
      ...(input.elapsedInCycleMs !== undefined
        ? { elapsedInCycleMs: input.elapsedInCycleMs }
        : {}),
      cycleN: input.cycleN,
      at: deps.clock.now(),
    });
    await deps.events.append(event);
    return true;
  }

  return {
    record,
    async noteQuarantine(input: QuarantineNote): Promise<boolean> {
      if (deps.responseQuality === undefined) return false;
      const quality = await deps.responseQuality.findBySession(input.sessionId);
      if (quality?.quarantined !== true) return false;
      return record({
        studentId: input.studentId,
        tenantId: input.tenantId,
        type: "session_quarantined",
        cycleN: input.cycleN,
      });
    },
  };
}
