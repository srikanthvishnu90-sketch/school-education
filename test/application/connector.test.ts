import { describe, expect, it } from "vitest";

import {
  DomainError,
  UnconfirmedFieldMapError,
  type CanonicalEvidence,
  type Prediction,
  type ProviderCapabilities,
} from "@/domain";
import type { EvidenceProvider } from "@/domain/ports";
import {
  evaluateCanonical,
  proposeFieldMap,
  receiveFromProvider,
} from "@/application";
import {
  LEDGER_PROVIDER_ID,
  QUIZWORLD_PROVIDER_ID,
  createItemLevelMockProvider,
  createProviderRegistry,
  createTotalOnlyMockProvider,
  ledgerFieldMap,
  quizWorldFieldMap,
} from "@/adapters/provider";

/**
 * The connector is the ONE piece of app code both providers flow through. These
 * tests prove: swapping providers changes nothing here, declared capabilities
 * gate the P6 ladder (item-level → perSkill, total-only → globalGap), a foreign
 * version is quarantined at the boundary, and a proposed map is refused.
 */

const ITEM_ROWS = [
  {
    learner: "stu-1",
    quizId: "q-1",
    quizName: "Unit 1",
    ts: "2026-01-05T09:00:00.000Z",
    questions: [
      { qid: "q1-a", standard: "skill-linear", score: 1, outOf: 1 },
      { qid: "q1-b", standard: "skill-linear", score: 0, outOf: 1 },
    ],
  },
];

const TOTAL_ROWS = [
  {
    sid: "stu-1",
    course: "hw-1",
    recorded: "2026-01-05T09:00:00.000Z",
    earned: 8,
    possible: 10,
    attended: true,
    tardyMinutes: 0,
  },
];

function itemProvider(): EvidenceProvider {
  return createItemLevelMockProvider({
    rows: ITEM_ROWS,
    fieldMap: quizWorldFieldMap(),
  });
}

function totalProvider(): EvidenceProvider {
  return createTotalOnlyMockProvider({
    rows: TOTAL_ROWS,
    fieldMap: ledgerFieldMap(),
  });
}

function itemPrediction(): Prediction {
  return {
    id: "pred-1",
    assessmentId: "q-1",
    studentId: "stu-1",
    itemPredictions: [
      { itemId: "q1-a", confidence: 0.9 },
      { itemId: "q1-b", confidence: 0.8 },
    ],
    globalPredicted: 0.7,
    createdAt: new Date("2026-01-04T09:00:00.000Z"),
  };
}

function globalPrediction(): Prediction {
  return {
    id: "pred-2",
    assessmentId: "hw-1",
    studentId: "stu-1",
    itemPredictions: [],
    globalPredicted: 0.7,
    createdAt: new Date("2026-01-04T09:00:00.000Z"),
  };
}

async function firstEvidence(provider: EvidenceProvider): Promise<CanonicalEvidence> {
  const { evidence } = await receiveFromProvider(provider, "stu-1");
  return evidence[0];
}

describe("capability flags gate eligibility", () => {
  it("item-level + skill-tagged provider → full eligibility with a per-skill breakdown", async () => {
    const evidence = await firstEvidence(itemProvider());
    const caps: ProviderCapabilities = {
      itemLevel: true,
      skillTags: true,
      attendance: false,
    };
    const result = evaluateCanonical(evidence, itemPrediction(), caps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluation.eligibility.level).toBe("full");
      expect(result.evaluation.eligibility.perSkillEligible).toBe(true);
      expect(result.evaluation.calibration?.perSkill).not.toBeNull();
    }
  });

  it("total-only provider → global eligibility, globalGap only, attendance carried", async () => {
    const evidence = await firstEvidence(totalProvider());
    const caps: ProviderCapabilities = {
      itemLevel: false,
      skillTags: false,
      attendance: true,
    };
    const result = evaluateCanonical(evidence, globalPrediction(), caps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.evaluation.eligibility.level).toBe("global");
      expect(result.evaluation.eligibility.perSkillEligible).toBe(false);
      expect(result.evaluation.calibration?.summary.globalGap).toBeCloseTo(-0.1, 10);
      expect(result.evaluation.calibration?.perSkill).toBeNull();
      expect(result.evaluation.attendance).toEqual({ present: true, minutesLate: 0 });
    }
  });

  it("declared (not discovered): item data under a skillTags=false flag withholds perSkill", async () => {
    const evidence = await firstEvidence(itemProvider());
    const result = evaluateCanonical(evidence, itemPrediction(), {
      itemLevel: true,
      skillTags: false,
      attendance: false,
    });
    expect(result.ok && result.evaluation.eligibility.level).toBe("item");
    expect(result.ok && result.evaluation.eligibility.perSkillEligible).toBe(false);
  });

  it("declared (not discovered): item data under an itemLevel=false flag caps at global", async () => {
    const evidence = await firstEvidence(itemProvider());
    const result = evaluateCanonical(evidence, itemPrediction(), {
      itemLevel: false,
      skillTags: false,
      attendance: false,
    });
    // No assignment total exists on item-level evidence, so a capped decision
    // yields global level with no computable calibration — honest, not invented.
    expect(result.ok && result.evaluation.eligibility.level).toBe("global");
    expect(result.ok && result.evaluation.calibration).toBeNull();
  });
});

describe("swapping providers changes no connector code", () => {
  it("the SAME receiveFromProvider drives both providers via the registry", async () => {
    const registry = createProviderRegistry();
    registry.register(itemProvider());
    registry.register(totalProvider());
    expect(registry.ids()).toEqual([QUIZWORLD_PROVIDER_ID, LEDGER_PROVIDER_ID]);

    for (const id of registry.ids()) {
      const provider = registry.select(id);
      const pull = await receiveFromProvider(provider, "stu-1");
      expect(pull.quarantined).toEqual([]);
      expect(pull.evidence.length).toBeGreaterThan(0);
      expect(pull.capabilities).toEqual(provider.capabilities());
    }
  });

  it("select throws for an unregistered provider id", () => {
    expect(() => createProviderRegistry().select("nope")).toThrow(DomainError);
  });
});

describe("boundary re-checks the version", () => {
  it("receiveFromProvider quarantines a foreign-version row a provider emits", async () => {
    const rogue: EvidenceProvider = {
      id: "provider-rogue",
      capabilities: () => ({ itemLevel: false, skillTags: false, attendance: false }),
      async pull() {
        return [
          {
            schemaVersion: 99,
            studentId: "stu-1",
            assessmentRef: "a-1",
            recordedAt: "2026-01-05T09:00:00.000Z",
          } as unknown as CanonicalEvidence,
        ];
      },
    };
    const pull = await receiveFromProvider(rogue, "stu-1");
    expect(pull.evidence).toEqual([]);
    expect(pull.quarantined).toHaveLength(1);
    expect(pull.quarantined[0].reason).toContain("schemaVersion 99");
  });
});

describe("refusal under an unconfirmed field map", () => {
  it("receiveFromProvider propagates the provider's refusal under a proposed map", async () => {
    const provider = createItemLevelMockProvider({
      rows: ITEM_ROWS,
      fieldMap: quizWorldFieldMap("proposed"),
    });
    await expect(receiveFromProvider(provider, "stu-1")).rejects.toBeInstanceOf(
      UnconfirmedFieldMapError,
    );
  });
});

describe("proposeFieldMap — labor, never auto-confirmed", () => {
  it("proposes name matches and always returns status 'proposed'", () => {
    const map = proposeFieldMap(
      "provider-x",
      ["studentId", "total_score", "junk"],
      ["studentId", "totalScore", "assessmentRef"],
    );
    expect(map.status).toBe("proposed");
    expect(map.mappings).toEqual({
      studentId: "studentId",
      total_score: "totalScore",
    });
  });

  it("claims each canonical target once — no silent last-writer overwrite", () => {
    // Both native fields normalize to "totalscore"; only the first wins.
    const map = proposeFieldMap(
      "provider-x",
      ["total_score", "totalScore"],
      ["totalScore"],
    );
    expect(map.mappings).toEqual({ total_score: "totalScore" });
  });
});
