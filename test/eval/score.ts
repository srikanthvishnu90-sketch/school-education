/**
 * A tiny, pure, dependency-free binary scorer for the eval harness. Given the
 * predicted "is this the hazard class?" booleans alongside the gold "is this the
 * hazard class?" booleans, it returns recall, precision, and the confusion counts.
 *
 * Recall = TP / (TP + FN) — of the real hazards, how many were caught. This is the
 *   priority metric for the safety set: a missed crisis is the unacceptable error.
 * Precision = TP / (TP + FP) — of the flags raised, how many were real hazards.
 *
 * Empty-denominator convention: recall is 1 when there are no positives to catch,
 * precision is 1 when nothing was flagged. The golden sets always carry positives,
 * so these conventions never mask a real regression here.
 */

export interface ScoreResult {
  recall: number;
  precision: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  total: number;
}

export function score(
  predicted: readonly boolean[],
  gold: readonly boolean[],
): ScoreResult {
  if (predicted.length !== gold.length) {
    throw new Error(
      `score: length mismatch (${predicted.length} predicted vs ${gold.length} gold)`,
    );
  }
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < gold.length; i++) {
    const p = predicted[i];
    const g = gold[i];
    if (g && p) tp++;
    else if (g && !p) fn++;
    else if (!g && p) fp++;
    else tn++;
  }
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  return {
    recall,
    precision,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    total: gold.length,
  };
}

/** Round to 3 decimals for stable, human-readable summary printing. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
