import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getAdminOverview } from "@/app/_world/adminActions";
import { getSessionUser } from "@/app/_world/session";
import type { AuditAction } from "@/app/_world/auditLog";

/**
 * The district-admin console: usage for the tenant and the access audit log. No
 * student content — counts and access records only. Tenant-scoped server-side.
 */

const ACTION_LABEL: Record<AuditAction, string> = {
  view_lesson: "Viewed a lesson",
  delete_lesson: "Deleted a lesson",
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
  const TASK_LABEL: Record<string, string> = {
    analyze: "Read the lesson",
    generate: "Draft the questions",
    converse: "Rephrase in chat",
    signals: "Tag the conversation",
    summarize: "Write the summary",
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
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
