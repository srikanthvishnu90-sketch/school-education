import { describe, expect, it } from "vitest";

import { recordAffect } from "@/app/_world/actions";
import { DEMO_ASSESSMENT_ID, getWorld } from "@/app/_world/world";

/**
 * The emotional-bandwidth law: the emotional step is optional at zero penalty and
 * the system never initiates emotionally. Skipping must write NOTHING and trigger
 * NOTHING. Choosing a word records exactly one snapshot. (Different archetypes so
 * the shared process-lifetime world does not couple the two assertions.)
 */
describe("emotional step — skip writes nothing", () => {
  it("recording with no terms writes nothing", async () => {
    const world = await getWorld();
    const student = "student-avery";
    const before = (await world.repos.affects.listByStudent(student)).length;
    await recordAffect({
      studentId: student,
      assessmentId: DEMO_ASSESSMENT_ID,
      terms: [],
    });
    const after = (await world.repos.affects.listByStudent(student)).length;
    expect(after).toBe(before);
  });

  it("choosing a differentiated word records exactly one snapshot", async () => {
    const world = await getWorld();
    const student = "student-blake";
    const before = (await world.repos.affects.listByStudent(student)).length;
    await recordAffect({
      studentId: student,
      assessmentId: DEMO_ASSESSMENT_ID,
      terms: ["anxious"],
    });
    const after = (await world.repos.affects.listByStudent(student)).length;
    expect(after).toBe(before + 1);
  });
});
