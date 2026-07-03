import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getSessionUser } from "@/app/_world/session";
import { listEscalations } from "@/app/_world/counselorActions";
import EscalationList from "./EscalationList";

/**
 * The counselor surface (P16) — the ONLY place crisis escalations are read, gated
 * to the designated counselor. It shows who, which tier, when, and delivery state,
 * so the counselor can follow the district's protocol. The triggering text is
 * never shown here; it is sealed and access-restricted.
 */
export default async function EscalationsPage(): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "counselor") {
    redirect("/signin");
  }
  const escalations = await listEscalations();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-ink-tint">
        Counselor
      </p>
      <h1 className="mt-3 text-2xl font-medium tracking-tight text-ink-black">
        Students who may need you
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-secondary">
        These are automatic notices raised when a student&rsquo;s writing suggested
        they might be at risk. Follow your school&rsquo;s protocol, then acknowledge.
      </p>
      <div className="mt-8">
        <EscalationList initial={escalations} />
      </div>
    </main>
  );
}
