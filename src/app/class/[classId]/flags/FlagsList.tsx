"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";
import { acknowledgeFlag } from "@/app/_world/teacherActions";

export interface FlagView {
  studentId: string;
  studentName: string;
  skillName: string | null;
  pattern: string;
  suggestedMove: "probe" | "exemplar";
}

const MOVE_COPY: Record<FlagView["suggestedMove"], string> = {
  probe: "Serve a fresh transfer probe on this skill.",
  exemplar: "Surface a correct worked exemplar for this skill.",
};

export default function FlagsList({
  flags,
}: {
  flags: FlagView[];
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function acknowledge(studentId: string): void {
    startTransition(async () => {
      await acknowledgeFlag(studentId);
      router.refresh();
    });
  }

  if (flags.length === 0) {
    return (
      <p className="mt-8 text-[15px] leading-relaxed text-secondary">
        Nothing to look at right now. Flags appear only for a severe or repeated
        gap, and clear once you acknowledge them.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {flags.map((flag) => (
        <div
          key={flag.studentId}
          className="flex gap-4 rounded-card border border-ink-wash bg-white p-6"
        >
          <span
            aria-hidden
            className="mt-1 block w-1 shrink-0 self-stretch rounded-full"
            style={{ backgroundColor: "var(--color-gap)" }}
          />
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-medium text-ink-black">
                {flag.studentName}
              </span>
              {flag.skillName !== null && (
                <span className="text-[13px] text-secondary">
                  {flag.skillName}
                </span>
              )}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-black">
              {flag.pattern}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-secondary">
              Suggested move: {MOVE_COPY[flag.suggestedMove]}
            </p>
            <button
              type="button"
              onClick={() => acknowledge(flag.studentId)}
              disabled={pending}
              className="mt-4 rounded-control bg-ink px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-50"
            >
              Acknowledge
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
