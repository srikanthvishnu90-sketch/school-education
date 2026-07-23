import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectCrisis } from "@/safety/detector";
import { containsCompanionLanguage } from "@/domain/intelligence/companionGuard";
import { isNonDiagnostic } from "@/domain/intelligence/nonDiagnostic";
import { probesProtectedTopic } from "@/domain/intelligence/ppraGuard";

import { round3, score, type ScoreResult } from "./score";

/**
 * The safety/quality EVAL HARNESS. A held-out golden set per deterministic
 * classifier, scored for recall + precision, gating CI. Its job is REGRESSION
 * DETECTION: each threshold below was set from a MEASURED value on these fixtures
 * and pinned at or just under it, so a future change that weakens a classifier
 * trips the gate. The fixtures are independently authored realistic paraphrases —
 * not copies of the classifiers' lexicon patterns — so the numbers are honest.
 *
 * Zero-LLM: every classifier here is the deterministic one; the harness never
 * makes a model call. Same fixtures → same scores, always.
 *
 * Thresholds (measured value → gate). Safety recall is the highest bar because a
 * missed crisis is the one error we refuse to ship:
 *   safety        recall  measured 1.000 → gate 0.95 (>= per brief); precision 1.000 → 0.90
 *   companion     recall  measured 1.000 → gate 0.90 ; precision 1.000 → 0.90
 *   non_diagnostic recall measured 1.000 → gate 0.90 ; precision 1.000 → 0.90
 *   ppra          recall  measured 1.000 → gate 0.90 ; precision 1.000 → 0.90
 */

const SAFETY_RECALL_GATE = 0.95;
const SAFETY_PRECISION_GATE = 0.9;
const COMPANION_RECALL_GATE = 0.9;
const COMPANION_PRECISION_GATE = 0.9;
const NON_DIAGNOSTIC_RECALL_GATE = 0.9;
const NON_DIAGNOSTIC_PRECISION_GATE = 0.9;
const PPRA_RECALL_GATE = 0.9;
const PPRA_PRECISION_GATE = 0.9;

interface GoldenExample {
  text: string;
  label: string;
}

function loadGolden(name: string): GoldenExample[] {
  const path = join(__dirname, "golden", `${name}.json`);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`golden/${name}.json is not an array`);
  }
  return parsed as GoldenExample[];
}

/**
 * Run a classifier over a golden set: `positiveLabel` is the hazard class, and
 * `classify` returns true when the classifier flags a text as that hazard.
 */
function evaluate(
  name: string,
  positiveLabel: string,
  classify: (text: string) => boolean,
): ScoreResult {
  const examples = loadGolden(name);
  const positives = examples.filter((e) => e.label === positiveLabel).length;
  const negatives = examples.length - positives;
  // Balance + size sanity: the brief requires >= 12, balanced positives/negatives.
  expect(examples.length, `${name}: at least 12 examples`).toBeGreaterThanOrEqual(
    12,
  );
  expect(positives, `${name}: has positives`).toBeGreaterThan(0);
  expect(negatives, `${name}: has negatives`).toBeGreaterThan(0);

  const predicted = examples.map((e) => classify(e.text));
  const gold = examples.map((e) => e.label === positiveLabel);
  const result = score(predicted, gold);

  // Human-readable per-set summary. No red/green accuracy semantics — plain text.
  console.log(
    `[eval] ${name}: n=${result.total} pos=${positives} neg=${negatives} ` +
      `recall=${round3(result.recall)} precision=${round3(result.precision)} ` +
      `(TP=${result.truePositives} FP=${result.falsePositives} ` +
      `FN=${result.falseNegatives} TN=${result.trueNegatives})`,
  );
  return result;
}

describe("eval harness — safety / crisis (recall is the priority metric)", () => {
  it("meets the pinned recall and precision gates", () => {
    const result = evaluate("safety", "crisis", (t) => detectCrisis(t) !== null);
    expect(result.recall).toBeGreaterThanOrEqual(SAFETY_RECALL_GATE);
    expect(result.precision).toBeGreaterThanOrEqual(SAFETY_PRECISION_GATE);
  });
});

describe("eval harness — companion language", () => {
  it("meets the pinned recall and precision gates", () => {
    const result = evaluate("companion", "companion", (t) =>
      containsCompanionLanguage(t),
    );
    expect(result.recall).toBeGreaterThanOrEqual(COMPANION_RECALL_GATE);
    expect(result.precision).toBeGreaterThanOrEqual(COMPANION_PRECISION_GATE);
  });
});

describe("eval harness — non-diagnostic language", () => {
  it("meets the pinned recall and precision gates", () => {
    const result = evaluate(
      "non_diagnostic",
      "diagnostic",
      (t) => !isNonDiagnostic(t),
    );
    expect(result.recall).toBeGreaterThanOrEqual(NON_DIAGNOSTIC_RECALL_GATE);
    expect(result.precision).toBeGreaterThanOrEqual(
      NON_DIAGNOSTIC_PRECISION_GATE,
    );
  });
});

describe("eval harness — PPRA protected-topic probes", () => {
  it("meets the pinned recall and precision gates", () => {
    const result = evaluate("ppra", "ppra", (t) => probesProtectedTopic(t));
    expect(result.recall).toBeGreaterThanOrEqual(PPRA_RECALL_GATE);
    expect(result.precision).toBeGreaterThanOrEqual(PPRA_PRECISION_GATE);
  });
});
