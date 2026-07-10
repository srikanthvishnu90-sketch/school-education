"use client";

import { useState, useTransition, type ReactElement } from "react";
import {
  recordReflectionScore,
  type StudentScoreRow,
} from "@/app/_world/teacherReflectionActions";

/**
 * Teacher score entry: the graded result behind each student's reflection. This is
 * recorded AFTER the fact — never a pre-registered bet — and is what the student's
 * self-confidence gets set beside on their timeline.
 */
export default function ScoreEntry({
  reflectionId,
  rows,
}: {
  reflectionId: string;
  rows: StudentScoreRow[];
}): ReactElement {
  if (rows.length === 0) {
    return (
      <p className="text-[14px] text-secondary">
        Scores can be entered once students have finished reflecting.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <ScoreRow key={row.studentId} reflectionId={reflectionId} row={row} />
      ))}
    </div>
  );
}

function ScoreRow({
  reflectionId,
  row,
}: {
  reflectionId: string;
  row: StudentScoreRow;
}): ReactElement {
  const [value, setValue] = useState(
    row.scorePercent === null ? "" : String(row.scorePercent),
  );
  const [saved, setSaved] = useState(row.scorePercent !== null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(): void {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError(true);
      return;
    }
    setError(false);
    startTransition(async () => {
      await recordReflectionScore(reflectionId, row.studentId, n);
      setSaved(true);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-card border border-ink-wash bg-white px-4 py-3">
      <span className="flex-1 text-[15px] text-ink-black">{row.name}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        aria-label={`Score for ${row.name}, percent`}
        className={`w-16 rounded-control border bg-white px-2 py-1.5 text-right text-[14px] text-ink-black outline-none focus:border-ink-tint ${
          error ? "border-warm" : "border-ink-wash"
        }`}
      />
      <span className="text-[13px] text-secondary">%</span>
      <button
        type="button"
        disabled={pending || value.trim().length === 0}
        onClick={save}
        className="rounded-control bg-ink px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40"
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
