import { describe, expect, it } from "vitest";

import {
  deriveReflectionOutcome,
  readSelfConfidence,
} from "@/domain/intelligence/metacognition";
import { buildIntelRepos, seedDemoReflection } from "@/app/_world/intelligence";
import { createDeterministicReflectionIntelligence } from "@/adapters/intelligence/deterministic";

/**
 * The demo students (Avery/Blake/Casey) ship with a sample completed reflection so a
 * fresh in-memory demo already has populated journeys, a three-student class brief,
 * and a real calibration spread — over-confident, under-confident, and aligned.
 */

const NOW = new Date("2026-07-20T12:00:00Z");
const DEMO = "lesson-demo";

async function seed() {
  const intel = await buildIntelRepos(null); // null → in-memory repos
  const ai = createDeterministicReflectionIntelligence({ now: () => NOW });
  await seedDemoReflection(ai, intel, () => NOW);
  return intel;
}

describe("seeded demo student reflections", () => {
  it("gives each demo student a completed, scored reflection with a chosen next step", async () => {
    const intel = await seed();
    const sessions = await intel.sessions.listByReflection(DEMO);
    const completed = sessions.filter((s) => s.status === "completed");
    expect(completed.map((s) => s.studentId).sort()).toEqual([
      "student-avery",
      "student-blake",
      "student-casey",
    ]);
    for (const s of completed) {
      expect(s.selectedAction && s.selectedAction.length > 0).toBe(true);
      expect(s.messages.length).toBeGreaterThan(6); // a real free-response transcript
      const summary = await intel.studentSummaries.findByReflectionAndStudent(
        DEMO,
        s.studentId,
      );
      expect(summary).not.toBeNull();
      const perf = await intel.performances.findByReflectionAndStudent(
        DEMO,
        s.studentId,
      );
      expect(perf).not.toBeNull();
    }
  });

  it("produces the three intended calibration outcomes", async () => {
    const intel = await seed();
    const outcomeFor = async (studentId: string) => {
      const session = await intel.sessions.findByReflectionAndStudent(DEMO, studentId);
      const perf = await intel.performances.findByReflectionAndStudent(DEMO, studentId);
      const confidence = readSelfConfidence(session!);
      return deriveReflectionOutcome(perf!, confidence).alignment;
    };
    expect(await outcomeFor("student-avery")).toBe("confidence_ahead_of_result"); // overconfident
    expect(await outcomeFor("student-blake")).toBe("result_ahead_of_confidence"); // underconfident
    expect(await outcomeFor("student-casey")).toBe("aligned"); // calibrated
  });

  it("leaves the Slope lesson un-reflected, so starting it live shows loop closure", async () => {
    const intel = await seed();
    const slope = await intel.sessions.listByReflection("lesson-demo-slope");
    expect(slope).toHaveLength(0);
  });

  it("ships each demo student with per-skill calibration whose delta sign matches their archetype", async () => {
    const intel = await seed();
    // The demo lesson tags at least one skill; every seeded student gets a record per tag.
    const tags = await intel.skillTags.listByClass("class-1");
    expect(tags.length).toBeGreaterThan(0);

    const recordsFor = async (studentId: string) => {
      const records = (await intel.calibrationRecords.listByStudent(studentId)).filter(
        (r) => r.lessonId === DEMO,
      );
      expect(records.length).toBe(tags.length); // one per tagged skill
      // Evidence backs every scored skill too.
      const evidence = await intel.evidence.listByStudentAndLesson(studentId, DEMO);
      expect(evidence.length).toBe(tags.length);
      return records;
    };

    // Avery — over-confident: claim ran ahead of the result → delta > 0.
    for (const r of await recordsFor("student-avery")) {
      expect(r.delta).not.toBeNull();
      expect(r.delta!).toBeGreaterThan(0);
    }
    // Blake — under-confident: the result ran ahead of the claim → delta < 0.
    for (const r of await recordsFor("student-blake")) {
      expect(r.delta).not.toBeNull();
      expect(r.delta!).toBeLessThan(0);
    }
    // Casey — aligned: the gap sits inside the tolerance band.
    for (const r of await recordsFor("student-casey")) {
      expect(r.delta).not.toBeNull();
      expect(Math.abs(r.delta!)).toBeLessThanOrEqual(0.15);
    }
  });
});
