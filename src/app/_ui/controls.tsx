"use client";

import type { ReactElement } from "react";

/**
 * The interactive controls. Both are TAP scales — coarse, low-effort choices, not
 * precision instruments (the emotional-bandwidth law: cost minutes, not effort).
 * Each control is exactly ONE decision.
 */

export interface TapOption {
  label: string;
  value: number;
}

/**
 * A five-point tap scale for confidence / estimate. No slider precision: the
 * student taps one band. The selected band uses ink-tint (the aligned/attention
 * color), never a red→green ramp.
 */
export function TapScale({
  options,
  value,
  onChange,
}: {
  options: readonly TapOption[];
  value: number | null;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2" role="radiogroup">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`w-full rounded-control border px-4 py-3 text-left text-[15px] transition-colors ${
              selected
                ? "border-ink-tint bg-ink-wash text-ink-black"
                : "border-ink-wash bg-white text-ink-black hover:border-ink-tint/50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** A single-select list of big tap targets — one decision, one tap. */
export function BigChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2" role="radiogroup">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`w-full rounded-control border px-4 py-3 text-left transition-colors ${
              selected
                ? "border-ink-tint bg-ink-wash"
                : "border-ink-wash bg-white hover:border-ink-tint/50"
            }`}
          >
            <span className="block text-[15px] text-ink-black">{option.label}</span>
            {option.hint !== undefined && (
              <span className="mt-0.5 block text-[13px] text-secondary">
                {option.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
