/**
 * Deterministic grading — turning a student's ACTUAL answer into real correctness,
 * so the outcome (and therefore calibration) reflects real performance, not a
 * seeded key. Grading is JUDGMENT and stays deterministic — never an LLM
 * (CLAUDE.md → "AI = labor, not judgment"). It handles the shapes these math items
 * produce: an integer, a decimal, or a simple fraction, tolerant of "x=" prefixes
 * and whitespace. Anything it cannot confidently parse is graded by exact
 * normalized match, and an empty answer is never correct.
 */

/** Lowercase, trim, strip a leading `x=`/`slope=`, and remove inner whitespace. */
export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(x|y|m|slope|answer)\s*=\s*/, "")
    .replace(/\s+/g, "");
}

/** Parse a plain number or a simple `a/b` fraction; null if neither. */
function toNumber(s: string): number | null {
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (frac !== null) {
    const denom = Number(frac[2]);
    if (denom === 0) return null;
    return Number(frac[1]) / denom;
  }
  return null;
}

/**
 * Grade a free-typed student answer against the correct answer. Numeric answers
 * compare by value (so `6/2` equals `3` equals `3.0`); everything else compares by
 * normalized string. An empty response is always incorrect.
 */
export function gradeAnswer(studentAnswer: string, correctAnswer: string): boolean {
  const s = normalizeAnswer(studentAnswer);
  const c = normalizeAnswer(correctAnswer);
  if (s.length === 0) return false;
  if (s === c) return true;
  const sn = toNumber(s);
  const cn = toNumber(c);
  return sn !== null && cn !== null && Math.abs(sn - cn) < 1e-9;
}
