import { beforeEach, describe, expect, it } from "vitest";

import {
  ASSESSMENT_ID,
  HISTORICAL_ASSESSMENT_ID,
  SKILL_SLOPE,
  buildIngestedWorld,
  type Archetype,
  type IngestedWorld,
} from "@/application";
import { evidenceOutcomeId } from "@/adapters/evidence";

/**
 * The agent loop running from INGESTED evidence — not seed. Outcomes exist only
 * because messy gradebook rows came through the EvidenceSource port, yet the
 * observe → decide → act loop behaves exactly as it did over seeded truth.
 */

describe("agent loop over the ingested world", () => {
  let world: IngestedWorld;

  const idOf = (archetype: Archetype): string => {
    const student = world.students.find((s) => s.archetype === archetype);
    if (student === undefined) throw new Error(`no ${archetype} student`);
    return student.id;
  };

  beforeEach(async () => {
    world = await buildIngestedWorld();
  });

  it("every archetype's outcome was INGESTED (evidence-derived identity, not seeded)", async () => {
    for (const student of world.students) {
      const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
        ASSESSMENT_ID,
        student.id,
      );
      expect(outcome).not.toBeNull();
      // The deterministic evidence id — a seeded outcome would be "out-<n>".
      expect(outcome?.id).toBe(evidenceOutcomeId(ASSESSMENT_ID, student.id));
    }
  });

  it("overconfident-low → serve_probe on the worst skill, acted via P4", async () => {
    const record = await world.agent.step(ASSESSMENT_ID, idOf("overconfident-low"));

    expect(record.decision.intervention).toBe("serve_probe");
    expect(record.decision.targetSkillId).toBe(SKILL_SLOPE);
    expect(record.actedVia).toBe("serveTransferProbe");
    expect(record.probeId).toBeDefined();
  });

  it("underconfident-high → schedule_reengagement", async () => {
    const record = await world.agent.step(
      ASSESSMENT_ID,
      idOf("underconfident-high"),
    );
    expect(record.decision.intervention).toBe("schedule_reengagement");
    expect(record.actedVia).toBe("none");
  });

  it("calibrated → serve_probe on slope (globally aligned, but per-skill overconfident there)", async () => {
    // Casey's ingested evidence: 0.7 confidence on both slope items, 1/2 correct
    // → per-skill bias 0.2 > eps. Identical to the policy's seeded-world verdict.
    const record = await world.agent.step(ASSESSMENT_ID, idOf("calibrated"));
    expect(record.decision.intervention).toBe("serve_probe");
    expect(record.decision.targetSkillId).toBe(SKILL_SLOPE);
  });

  it("the revised grade won: the stored outcome carries revision 2's values", async () => {
    const avery = idOf("overconfident-low");
    const outcome = await world.repos.outcomes.findByAssessmentAndStudent(
      ASSESSMENT_ID,
      avery,
    );
    // Rev 1 mis-graded item-2 as correct; rev 2 fixed it.
    expect(outcome?.itemOutcomes.map((io) => io.correct)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    const report = world.reports[avery];
    expect(report.ingested.find((e) => e.revision === 2)?.updated).toBe(true);
  });

  it("current evidence is fully calibration-eligible; the historical grade stays baseline", () => {
    const avery = idOf("overconfident-low");
    const blake = idOf("underconfident-high");

    const averyU1 = world.reports[avery].ingested.find(
      (e) => e.assessmentId === ASSESSMENT_ID && e.revision === 2,
    );
    expect(averyU1?.eligibility.level).toBe("full");
    expect(averyU1?.calibration?.perSkill?.length).toBeGreaterThan(0);

    const blakeU0 = world.reports[blake].ingested.find(
      (e) => e.assessmentId === HISTORICAL_ASSESSMENT_ID,
    );
    expect(blakeU0?.eligibility.level).toBe("baseline");
    expect(blakeU0?.calibration).toBeNull();
  });

  it("the malformed gradebook row was quarantined while the rest of the sync proceeded", () => {
    const avery = idOf("overconfident-low");
    const report = world.reports[avery];
    expect(report.quarantined).toHaveLength(1);
    expect(report.quarantined[0].record.externalId).toBe("gb-broken");
    expect(report.quarantined[0].reason.length).toBeGreaterThan(0);
    expect(report.ingested.length).toBeGreaterThan(0);
  });

  it("is fully deterministic: two builds produce identical reports", async () => {
    const again = await buildIngestedWorld();
    expect(again.reports).toEqual(world.reports);
  });
});
