import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import IngestForm from "./IngestForm";

/**
 * The operator evidence-import route (P15). Authed to the teacher/operator role
 * (P12); a student or signed-out visitor never reaches it. File in (a OneRoster
 * CSV bundle), ingestion report out. No student-facing UI, no quality flags.
 */
export default async function IngestPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "teacher") {
    redirect("/signin");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-ink-tint">
        Operator
      </p>
      <h1 className="mt-3 text-2xl font-medium tracking-tight text-ink-black">
        Import a gradebook export
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-secondary">
        Paste a OneRoster CSV bundle — your <code>results</code> export and its{" "}
        <code>lineItems</code> export. Rows that can&rsquo;t be read are reported
        back to you with a reason, never silently dropped.
      </p>
      <div className="mt-8">
        <IngestForm />
      </div>
    </main>
  );
}
