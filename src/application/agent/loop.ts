import type { Id } from "@/domain";
import type { Clock, LanguageCapability } from "@/domain/ports";
import type { AssessmentRepository } from "@/domain/ports";
import type { Services } from "../services";
import type { Observer } from "./observe";
import type { AgentDecision, AgentObservation } from "./types";

/**
 * AgentLoop — observe → decide → act (via P4 services) → record → repeat.
 *
 * Only `serve_probe` currently maps to a P4 service (serveTransferProbe); the
 * other interventions are recorded as planned actions until later phases add
 * their surfaces. The LanguageCapability is used purely as LABOR here (tagging
 * which skills a decision touches) — never to make the decision.
 *
 * Acting does not yet mutate calibration, so `run` is bounded: it stops at
 * `maxSteps`, at a terminal `schedule_reengagement`, or when an intervention
 * repeats (no new signal to act on).
 */

export interface InterventionRecord {
  decision: AgentDecision;
  actedVia: "serveTransferProbe" | "none";
  probeId?: Id;
  taggedSkills: Id[];
  at: Date;
}

export interface AgentLoopDeps {
  observer: Observer;
  policy: (observation: AgentObservation) => AgentDecision;
  services: Services;
  assessments: AssessmentRepository;
  language: LanguageCapability;
  clock: Clock;
}

export interface AgentLoop {
  step(assessmentId: Id, studentId: Id): Promise<InterventionRecord>;
  run(
    assessmentId: Id,
    studentId: Id,
    maxSteps?: number,
  ): Promise<InterventionRecord[]>;
}

export function createAgentLoop(deps: AgentLoopDeps): AgentLoop {
  async function step(
    assessmentId: Id,
    studentId: Id,
  ): Promise<InterventionRecord> {
    const observation = await deps.observer.observe(assessmentId, studentId);
    const decision = deps.policy(observation);

    const skillRefs = observation.perSkill.map((s) => ({
      id: s.skillId,
      name: s.skillId,
    }));
    const noteText = `${decision.rationale} ${observation.reflection?.attribution.note ?? ""}`;
    const taggedSkills = deps.language.tagSkills(noteText, skillRefs);

    let actedVia: "serveTransferProbe" | "none" = "none";
    let probeId: Id | undefined;
    if (
      decision.intervention === "serve_probe" &&
      decision.targetSkillId !== undefined
    ) {
      const assessment = await deps.assessments.findById(assessmentId);
      const item = assessment?.items.find(
        (i) => i.skillId === decision.targetSkillId,
      );
      if (item !== undefined) {
        const probe = await deps.services.serveTransferProbe({
          assessmentId,
          skillId: decision.targetSkillId,
          itemId: item.id,
        });
        actedVia = "serveTransferProbe";
        probeId = probe.id;
      }
    }

    return { decision, actedVia, probeId, taggedSkills, at: deps.clock.now() };
  }

  async function run(
    assessmentId: Id,
    studentId: Id,
    maxSteps = 3,
  ): Promise<InterventionRecord[]> {
    const records: InterventionRecord[] = [];
    let previous: string | null = null;
    for (let i = 0; i < maxSteps; i++) {
      const record = await step(assessmentId, studentId);
      records.push(record);
      if (record.decision.intervention === "schedule_reengagement") break;
      if (previous !== null && previous === record.decision.intervention) break;
      previous = record.decision.intervention;
    }
    return records;
  }

  return { step, run };
}
