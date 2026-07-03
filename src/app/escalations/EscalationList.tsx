"use client";

import { useState, useTransition, type ReactElement } from "react";
import {
  acknowledgeEscalation,
  type EscalationView,
} from "@/app/_world/counselorActions";

/**
 * The counselor's escalation list. Tier and delivery state are shown in calm,
 * task-neutral language — never red/green. The sealed text is not shown; the
 * counselor follows protocol and acknowledges, which stops the retries.
 */
export default function EscalationList({
  initial,
}: {
  initial: EscalationView[];
}): ReactElement {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();

  function ack(id: string): void {
    startTransition(async () => {
      await acknowledgeEscalation(id);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, acknowledged: true } : r)),
      );
    });
  }

  const open = rows.filter((r) => !r.acknowledged);
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-ink-wash bg-paper p-6 text-[15px] text-secondary">
        Nothing to look at right now.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between rounded-card border border-ink-wash bg-white p-5"
        >
          <div>
            <p className="text-[15px] font-medium text-ink-black">{r.studentId}</p>
            <p className="mt-1 text-[13px] text-secondary">
              {r.tier === "tier_1" ? "Needs attention now" : "Worth checking in"} ·{" "}
              {new Date(r.createdAt).toLocaleString()} ·{" "}
              {r.undelivered
                ? "not yet delivered — operator alerted"
                : r.delivered
                  ? "delivered to you"
                  : "pending"}
            </p>
          </div>
          {r.acknowledged ? (
            <span className="text-[13px] uppercase tracking-[0.16em] text-ink-tint">
              Acknowledged
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => ack(r.id)}
              className="shrink-0 rounded-control border border-ink-wash bg-white px-4 py-2 text-sm font-medium text-ink-black transition-colors hover:border-ink-tint/50 disabled:opacity-50"
            >
              Acknowledge
            </button>
          )}
        </li>
      ))}
      {open.length === 0 && (
        <li className="pt-2 text-[13px] text-secondary">
          All current notices acknowledged.
        </li>
      )}
    </ul>
  );
}
