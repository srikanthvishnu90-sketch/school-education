import { describe, expect, it } from "vitest";

import { classifyCalibration } from "@/domain";
import { buildSeededWorld } from "@/application";

describe("seeded world — three archetypes run end to end", () => {
  it("yields the intended calibration + congruence + granularity per student", async () => {
    const world = await buildSeededWorld();

    const rows = [];
    for (const student of world.students) {
      const gap = await world.services.computeGap(
        world.assessmentId,
        student.id,
      );
      rows.push({
        archetype: student.archetype,
        calibration: classifyCalibration(gap.calibration.bias as number),
        congruence: gap.congruence?.classification ?? null,
        granularity: gap.granularity,
      });
    }

    for (const r of rows) {
      console.log(
        `[${r.archetype}] calibration=${r.calibration} congruence=${r.congruence} granularity=${r.granularity}`,
      );
    }

    const byArchetype = Object.fromEntries(rows.map((r) => [r.archetype, r]));

    expect(byArchetype["overconfident-low"]).toMatchObject({
      calibration: "overconfident",
      congruence: "over_positive",
    });
    expect(byArchetype["underconfident-high"]).toMatchObject({
      calibration: "underconfident",
      congruence: "over_negative",
    });
    expect(byArchetype["calibrated"]).toMatchObject({
      calibration: "calibrated",
      congruence: "congruent",
    });

    // overconfident-low uses a single undifferentiated "good" ⇒ lowest granularity.
    const grans = rows.map((r) => r.granularity as number);
    expect(byArchetype["overconfident-low"].granularity).toBe(
      Math.min(...grans),
    );
    expect(byArchetype["overconfident-low"].granularity).toBe(1);
  });

  it("is fully deterministic (no Date.now/random): same ids across builds", async () => {
    const a = await buildSeededWorld();
    const b = await buildSeededWorld();
    const goalsA = await a.repos.goals.listByStudent("student-avery");
    const goalsB = await b.repos.goals.listByStudent("student-avery");
    expect(goalsA).toEqual(goalsB);
    expect(goalsA[0].createdAt.toISOString()).toBe(
      goalsB[0].createdAt.toISOString(),
    );
  });
});
