import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { hasReflectionConsent } from "@/app/_world/consentActions";
import { getSessionUser } from "@/app/_world/session";
import ConsentForm from "./ConsentForm";

/** Only a student consents to reflect. `next` is where to go once consent is given. */
function safeNext(next: string | undefined): string {
  // Only allow internal paths, so ?next= can't be turned into an open redirect.
  if (next !== undefined && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/courses";
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<ReactElement> {
  const { next } = await searchParams;
  const destination = safeNext(next);

  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");
  if (await hasReflectionConsent()) redirect(destination);

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center bg-shell-background px-4">
      <ConsentForm next={destination} />
    </main>
  );
}
