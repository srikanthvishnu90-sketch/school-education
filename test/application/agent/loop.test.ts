import { beforeEach, describe, expect, it } from "vitest";

import {
  buildSeededWorld,
  ASSESSMENT_ID,
  SKILL_SLOPE,
  type Archetype,
  type SeededWorld,
} from "@/application/seed";

/**
 * End-to-end over the seeded archetype world: observe (real repos) → decide
 * (pure policy) → act (P4 serveTransferProbe). Proves the agent emits the
 * intended intervention per archetype using only in-memory infrastructure.
 */

describe("AgentLoop over the seeded world", () => {
  let world: SeededWorld;

  const idOf = (archetype: Archetype): string => {
    const student = world.students.find((s) => s.archetype === archetype);
    if (student === undefined) throw new Error(`no ${archetype} student seeded`);
    return student.id;
  };

  beforeEach(async () => {
    world = await buildSeededWorld();
  });

  it("overconfident-low → serve_probe on the worst skill, acted via P4", async () => {
    const record = await world.agent.step(ASSESSMENT_ID, idOf("overconfident-low"));

    expect(record.decision.intervention).toBe("serve_probe");
    // Avery is overconfident on BOTH skills but worst on slope (0/2 correct at 0.9).
    expect(record.decision.targetSkillId).toBe(SKILL_SLOPE);
    // The loop actually acted through the P4 service, minting a real probe.
    expect(record.actedVia).toBe("serveTransferProbe");
    expect(record.probeId).toBeDefined();
  });

  it("underconfident-high → schedule_reengagement (a probe never punctures underconfidence)", async () => {
    const record = await world.agent.step(ASSESSMENT_ID, idOf("underconfident-high"));

    expect(record.decision.intervention).toBe("schedule_reengagement");
    expect(record.actedVia).toBe("none");
    expect(record.probeId).toBeUndefined();
  });

  it("the served probe is persisted through the P4 repository", async () => {
    const record = await world.agent.step(ASSESSMENT_ID, idOf("overconfident-low"));
    const probe = await world.repos.transferProbes.findById(record.probeId!);

    expect(probe).not.toBeNull();
    expect(probe!.skillId).toBe(SKILL_SLOPE);
  });
});
