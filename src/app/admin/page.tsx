import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import {
  exportConsentRecords,
  getAdminOverview,
  getProgramMetrics,
} from "@/app/_world/adminActions";
import { getSessionUser } from "@/app/_world/session";
import type { AuditAction } from "@/app/_world/auditLog";

/**
 * The district-admin console: usage for the tenant and the access audit log. No
 * student content — counts and access records only. Tenant-scoped server-side.
 */

const ACTION_LABEL: Record<AuditAction, string> = {
  view_lesson: "Viewed a lesson",
  delete_lesson: "Deleted a lesson",
  approve_reflection: "Approved a reflection for students",
  view_class_brief: "Viewed a class brief",
  view_scores: "Viewed scores",
  record_score: "Recorded a score",
  view_escalations: "Opened escalations",
  view_escalation: "Viewed an escalation",
  erase_data: "Erased their data",
};

function displayName(id: string): string {
  const raw = id.replace(/^student-|^teacher-|^counselor-|^admin-/, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default async function AdminPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "admin") redirect("/signin");

  const { tenantId, usage, audit, assistantHealth } = await getAdminOverview();
  const metrics = await getProgramMetrics();
  const consent = await exportConsentRecords();
  const under13Count = consent.records.filter((r) => r.under13).length;
  const TASK_LABEL: Record<string, string> = {
    analyze: "Read the lesson",
    generate: "Draft the questions",
    converse: "Rephrase in chat",
    signals: "Tag the conversation",
    summarize: "Write the summary",
  };

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-14">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
        District admin · {tenantId}
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">Overview</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Lessons" value={usage.lessons} />
        <Stat label="Students active" value={usage.students} />
        <Stat label="Reflections started" value={usage.reflectionsStarted} />
        <Stat label="Completed" value={usage.reflectionsCompleted} />
      </div>

      {assistantHealth.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
            Assistant health
          </h2>
          <p className="mt-2 text-[14px] text-secondary">
            The assistant only drafts; it never decides. This shows how often each
            drafting task&rsquo;s output was good enough to keep — the system throttles
            itself to the deterministic path when a task&rsquo;s quality drops, and
            re-tests to recover.
          </p>
          <ul className="mt-4 divide-y divide-ink-wash rounded-card border border-ink-wash bg-white">
            {assistantHealth.map((h) => (
              <li key={h.task} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[14px] text-ink-black">
                  {TASK_LABEL[h.task] ?? h.task}
                </span>
                <span className="flex items-center gap-3 text-[13px] text-secondary">
                  <span>
                    {Math.round(h.acceptanceRate * 100)}% kept · {h.samples} recent
                  </span>
                  <span className="text-ink-black">
                    {h.healthy ? "Using assistant" : "On deterministic path"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
          Program metrics
        </h2>
        <p className="mt-2 text-[14px] text-secondary">
          A current snapshot of engagement and self-knowledge across the district —
          aggregate counts only, no student named. Rates read against their raw
          denominators, and where the numbers are still thin they say so rather than
          imply a precise figure. This is a point in time; a trend over time needs
          durable storage and is not yet wired.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Readout
            label="Participation"
            value={asPercent(metrics.participationRate)}
            detail={`${metrics.participantCount} of ${metrics.rosterSize} students have started a reflection`}
          />
          <Readout
            label="Reflections finished"
            value={asPercent(metrics.completionRate)}
            detail={`${metrics.completedCount} of ${metrics.startedCount} started reflections completed`}
          />
          <Readout
            label="Self-judgment in step with results"
            value={asPercent(metrics.alignmentShare)}
            detail={`across ${metrics.gradedCount} graded ${metrics.gradedCount === 1 ? "reflection" : "reflections"}`}
          />
          <Readout
            label="Self-knowledge gap"
            value={
              metrics.meanAbsCalibrationGap === null
                ? null
                : `average ${metrics.meanAbsCalibrationGap.toFixed(2)}`
            }
            detail={`across ${metrics.calibrationGapCount} graded ${metrics.calibrationGapCount === 1 ? "record" : "records"} · lower means closer`}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
          Consent register
        </h2>
        <p className="mt-2 text-[14px] text-secondary">
          Who currently holds permission to reflect, and on what basis. Under-13
          students reflect only on a parent or guardian&rsquo;s permission (COPPA);
          this is the record of that. Roster-level only — no reflection content.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Stat label="With consent" value={consent.records.length} />
          <Stat label="Parent/guardian-granted (under 13)" value={under13Count} />
        </div>
        {consent.records.length === 0 ? (
          <p className="mt-4 text-[14px] text-secondary">No consent recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-wash rounded-card border border-ink-wash bg-white">
            {consent.records.map((r) => (
              <li key={r.studentId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-[14px] text-ink-black">
                  <span className="font-medium">{displayName(r.studentId)}</span>{" "}
                  <span className="text-secondary">
                    · {r.under13 ? "Parent/guardian permission" : "Self (13 or older)"}
                  </span>
                </span>
                <time className="shrink-0 text-[12px] text-secondary">
                  {new Date(r.grantedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-secondary">
          Access log
        </h2>
        <p className="mt-2 text-[14px] text-secondary">
          Every time staff read or changed a student&rsquo;s record. This is the
          FERPA record-of-access — who saw what, and when.
        </p>
        {audit.length === 0 ? (
          <p className="mt-4 text-[14px] text-secondary">No access recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-wash rounded-card border border-ink-wash bg-white">
            {audit.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-[14px] text-ink-black">
                  <span className="font-medium">{displayName(e.actorId)}</span>{" "}
                  <span className="text-secondary">({e.actorRole})</span>{" "}
                  {ACTION_LABEL[e.action]}
                  {e.studentId !== undefined && (
                    <span className="text-secondary"> · {displayName(e.studentId)}</span>
                  )}
                </span>
                <time className="shrink-0 text-[12px] text-secondary">
                  {new Date(e.at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="rounded-card border border-ink-wash bg-white px-4 py-3">
      <p className="text-[12px] text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-black">{value}</p>
    </div>
  );
}

/** A rate as a whole-number percent, or null when there is no denominator to divide by. */
function asPercent(rate: number | null): string | null {
  return rate === null ? null : `${Math.round(rate * 100)}%`;
}

/**
 * One program-metric readout: a label, its headline value, and the raw denominator it
 * rests on. A null value renders as a plain "Not enough data yet" — never 0%, never a
 * colour-coded verdict — so a thin metric reads as absence of data, not as a bad score.
 */
function Readout({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | null;
  detail: string;
}): ReactElement {
  return (
    <div className="rounded-card border border-ink-wash bg-white px-4 py-3">
      <p className="text-[12px] text-secondary">{label}</p>
      {value === null ? (
        <p className="mt-1 text-[15px] text-secondary">Not enough data yet</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-black">
            {value}
          </p>
          <p className="mt-1 text-[13px] text-secondary">{detail}</p>
        </>
      )}
    </div>
  );
}
