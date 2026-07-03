import type { LanguageTask } from "../gateway";
import type { AsyncLanguageCapability } from "../llm";
import { validateRenderedQuestion } from "../llm";
import {
  ATTRIBUTION_GOLDEN,
  RENDER_GOLDEN,
  SKILLS,
  SKILL_GOLDEN,
  type AttributionCase,
  type RenderCase,
  type SkillCase,
} from "./golden";

/**
 * The eval harness — the real deliverable of P14. It scores any capability
 * against the golden sets, compares two capabilities head-to-head, and decides
 * per task whether a candidate (the model) is trusted or the deterministic
 * baseline should be used instead. Honest evaluation: same fixtures for both,
 * ground truth from `golden.ts`, no fitting to the set.
 */

export interface TaskScore {
  n: number;
  /** classify: accuracy; tag: F1; render: pass rate. All in [0, 1]. */
  score: number;
}

export type Report = Readonly<Record<LanguageTask, TaskScore>>;

async function scoreClassify(
  cap: AsyncLanguageCapability,
  cases: readonly AttributionCase[],
): Promise<TaskScore> {
  let correct = 0;
  for (const c of cases) {
    if ((await cap.classifyAttribution(c.text)) === c.label) correct++;
  }
  return { n: cases.length, score: cases.length === 0 ? 0 : correct / cases.length };
}

async function scoreTag(
  cap: AsyncLanguageCapability,
  cases: readonly SkillCase[],
): Promise<TaskScore> {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const c of cases) {
    const got = new Set(await cap.tagSkills(c.text, SKILLS));
    const want = new Set(c.expected);
    for (const id of got) {
      if (want.has(id)) tp++;
      else fp++;
    }
    for (const id of want) if (!got.has(id)) fn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { n: cases.length, score: f1 };
}

async function scoreRender(
  cap: AsyncLanguageCapability,
  cases: readonly RenderCase[],
): Promise<TaskScore> {
  let passed = 0;
  for (const c of cases) {
    const out = await cap.renderQuestion(c.template, c.slots);
    const safe = validateRenderedQuestion(out);
    const keepsInfo = c.mustContain.every((s) => out.includes(s));
    if (safe && keepsInfo) passed++;
  }
  return { n: cases.length, score: cases.length === 0 ? 0 : passed / cases.length };
}

export async function evalCapability(
  cap: AsyncLanguageCapability,
): Promise<Report> {
  const [classify, tag, render] = await Promise.all([
    scoreClassify(cap, ATTRIBUTION_GOLDEN),
    scoreTag(cap, SKILL_GOLDEN),
    scoreRender(cap, RENDER_GOLDEN),
  ]);
  return { classify, tag, render };
}

const TASKS: readonly LanguageTask[] = ["classify", "tag", "render"];

/**
 * The regression gate. A candidate earns a task ONLY if it beats the baseline by
 * at least `margin` on that task; otherwise the task routes to deterministic.
 * This is exactly the `LlmConfig.tasks` map — the gate's output configures the
 * adapter, so a model that doesn't clear the bar is silently never called for it.
 */
export function regressionGate(
  baseline: Report,
  candidate: Report,
  margin: number,
): Record<LanguageTask, boolean> {
  const out = {} as Record<LanguageTask, boolean>;
  for (const task of TASKS) {
    out[task] = candidate[task].score >= baseline[task].score + margin;
  }
  return out;
}

/** A plain, printable comparison table (baseline vs candidate, per task, + verdict). */
export function comparisonTable(
  baseline: Report,
  candidate: Report,
  margin: number,
): string {
  const gate = regressionGate(baseline, candidate, margin);
  const rows = TASKS.map((task) => {
    const b = baseline[task].score.toFixed(3);
    const c = candidate[task].score.toFixed(3);
    const verdict = gate[task] ? "model" : "deterministic";
    return `  ${task.padEnd(9)} baseline=${b}  candidate=${c}  → ${verdict}`;
  });
  return [
    `language eval — margin ${margin}`,
    ...rows,
  ].join("\n");
}

/**
 * Drift check: the pinned model strings must match what the golden sets were last
 * evaluated against. A model swap changes `actual`, fails this, and forces a
 * re-eval before the new model can ship.
 */
export function driftCheck(
  actual: Readonly<Record<LanguageTask, string>>,
  expected: Readonly<Record<LanguageTask, string>>,
): { ok: boolean; drifted: LanguageTask[] } {
  const drifted = TASKS.filter((task) => actual[task] !== expected[task]);
  return { ok: drifted.length === 0, drifted };
}
