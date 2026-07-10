import {
  createSequentialClock,
  createSequentialIdGenerator,
} from "@/adapters/memory";
import {
  createPgAffectRepository,
  createPgAssessmentRepository,
  createPgClient,
  createPgConsentRepository,
  createPgEmotionVocabularyRepository,
  createPgFlagAcknowledgementRepository,
  createPgGoalRepository,
  createPgLearningMapRepository,
  createPgOutcomeRepository,
  createPgPilotEventRepository,
  createPgPseudonymRepository,
  createPgReflectionRepository,
  createPgTransferProbeRepository,
  applyRls,
  runMigrations,
  type SqlClient,
} from "@/adapters/supabase";
import { START_EPOCH, type Repos, type WorldCore } from "./seed";
import { createConsentService } from "./consent";
import { createPilotTelemetry } from "./pilot";
import { createServices } from "./services";

/**
 * The persistent composition root. It wires the SAME services as buildWorldCore,
 * but over the Postgres adapters instead of the in-memory ones — the domain is
 * untouched; only the adapters change. Migrations are applied on build; the
 * injected clock stamps every row's created_at.
 */

export interface PersistentOptions {
  client?: SqlClient;
  connectionString?: string;
}

export interface PersistentCore extends WorldCore {
  client: SqlClient;
}

export async function buildPersistentCore(
  opts: PersistentOptions = {},
): Promise<PersistentCore> {
  const client =
    opts.client ??
    createPgClient(opts.connectionString ?? process.env.DATABASE_URL ?? "");
  await runMigrations(client);
  await applyRls(client);

  const clock = createSequentialClock(START_EPOCH);
  const ids = createSequentialIdGenerator();

  const repos: Repos = {
    assessments: createPgAssessmentRepository(client, clock),
    goals: createPgGoalRepository(client, clock),
    outcomes: createPgOutcomeRepository(client, clock),
    reflections: createPgReflectionRepository(client, clock),
    transferProbes: createPgTransferProbeRepository(client, clock),
    learningMaps: createPgLearningMapRepository(client, clock),
    affects: createPgAffectRepository(client, clock),
    emotionVocab: createPgEmotionVocabularyRepository(client, clock),
    consent: createPgConsentRepository(client, clock),
    flagAcks: createPgFlagAcknowledgementRepository(client, clock),
    pilotEvents: createPgPilotEventRepository(client, clock),
  };

  const services = createServices({
    clock,
    ids,
    assessments: repos.assessments,
    goals: repos.goals,
    outcomes: repos.outcomes,
    reflections: repos.reflections,
    transferProbes: repos.transferProbes,
    affects: repos.affects,
    consent: repos.consent,
  });

  const consentService = createConsentService({
    clock,
    ids,
    consent: repos.consent,
    affects: repos.affects,
  });

  const telemetry = createPilotTelemetry({
    clock,
    consent: repos.consent,
    pseudonyms: createPgPseudonymRepository(client, clock),
    events: repos.pilotEvents,
  });

  return {
    repos,
    clock,
    ids,
    services,
    consentService,
    telemetry,
    client,
  };
}
