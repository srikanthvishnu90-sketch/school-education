"use client";

import { useActionState, type ReactElement } from "react";
import { ingestOneRoster, type IngestReport } from "@/app/_world/ingestActions";

/**
 * The operator's paste-and-import form. Uses a server action (evidence never
 * enters through the client) and renders the row-level ingestion report:
 * accepted count, a small sample, and every quarantined row with its reason.
 */
export default function IngestForm(): ReactElement {
  const [report, action, pending] = useActionState<IngestReport | null, FormData>(
    ingestOneRoster,
    null,
  );

  return (
    <div>
      <form action={action} className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-ink-black">results.csv</span>
          <textarea
            name="results"
            rows={6}
            placeholder="sourcedId,studentSourcedId,lineItemSourcedId,score,scoreDate,scoreStatus"
            className="mt-2 w-full rounded-control border border-ink-wash bg-white px-4 py-3 font-mono text-[13px] text-ink-black outline-none focus:border-ink-tint"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink-black">lineItems.csv</span>
          <textarea
            name="lineItems"
            rows={4}
            placeholder="sourcedId,title,resultValueMax"
            className="mt-2 w-full rounded-control border border-ink-wash bg-white px-4 py-3 font-mono text-[13px] text-ink-black outline-none focus:border-ink-tint"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40"
        >
          {pending ? "Reading…" : "Import"}
        </button>
      </form>

      {report !== null && (
        <div className="mt-8 rounded-card border border-ink-wash bg-paper p-6">
          {report.error !== undefined ? (
            <p className="text-[15px] text-ink-black">{report.error}</p>
          ) : (
            <>
              <p className="text-[15px] text-ink-black">
                {report.acceptedCount} of {report.totalRows} rows imported.
              </p>
              {report.acceptedSample.length > 0 && (
                <ul className="mt-3 space-y-1 text-[13px] text-secondary">
                  {report.acceptedSample.map((s) => (
                    <li key={`${s.studentId}-${s.assessmentRef}`}>
                      {s.studentId} · {s.assessmentRef}
                    </li>
                  ))}
                </ul>
              )}
              {report.quarantined.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-medium text-ink-black">
                    {report.quarantined.length} row
                    {report.quarantined.length === 1 ? "" : "s"} need a look
                  </p>
                  <ul className="mt-2 space-y-1 text-[13px] text-secondary">
                    {report.quarantined.map((q) => (
                      <li key={q.line}>
                        Line {q.line}: {q.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
