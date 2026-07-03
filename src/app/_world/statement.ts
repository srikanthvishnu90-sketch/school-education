/**
 * The ONE calibration statement shown on the result screen — the academic
 * decompose in TASK language. This is a product-safety surface (CLAUDE.md →
 * Kluger & DeNisi): feedback talks about the WORK, never the worth. So this is a
 * pure function with no self-referential vocabulary, no exclamation, and a tone
 * that maps only to the sanctioned accuracy semantics (aligned = ink-tint, gap =
 * warm) — never red/green.
 */

export type StatementTone = "aligned" | "gap";

export interface CalibrationStatement {
  text: string;
  tone: StatementTone;
}

export interface CalibrationStatementInput {
  /** Human-readable skill name, e.g. "interpreting slope". */
  skillName: string;
  /** meanConfidence − accuracy on that skill. >0 confidence ran ahead. */
  bias: number;
  /** Tolerance within which confidence and results count as aligned. */
  eps?: number;
}

/** Builds the calibration statement for the widest-gap skill. */
export function calibrationStatement(
  input: CalibrationStatementInput,
): CalibrationStatement {
  const eps = input.eps ?? 0.15;
  if (Math.abs(input.bias) <= eps) {
    return {
      tone: "aligned",
      text: `Your confidence and your results lined up on ${input.skillName}.`,
    };
  }
  const direction = input.bias > 0 ? "ran ahead of" : "fell behind";
  return {
    tone: "gap",
    text:
      `Your confidence and your results were far apart on ${input.skillName}. ` +
      `Here, your confidence ${direction} the evidence.`,
  };
}
