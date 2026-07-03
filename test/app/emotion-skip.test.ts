import { describe, expect, it } from "vitest";

import { recordAffect } from "@/app/_world/actions";
import { DEMO_ASSESSMENT_ID, getWorld } from "@/app/_world/world";

/**
 * The emotional-bandwidth law at the action layer: skipping the feeling step
 * (no terms) writes NOTHING and triggers NOTHING — recordAffect returns before it
 * ever reaches the session or the services. (The consent gate and the browser
 * e2e cover the "records exactly one when a word is chosen" path, which needs a
 * signed-in session.)
 */
describe("emotional step — skip writes nothing", () => {
  it("recording with no terms writes nothing", async () => {
    const world = await getWorld();
    const student = "student-avery";
    const before = (await world.repos.affects.listByStudent(student)).length;
    await recordAffect({ assessmentId: DEMO_ASSESSMENT_ID, terms: [] });
    const after = (await world.repos.affects.listByStudent(student)).length;
    expect(after).toBe(before);
  });
});
