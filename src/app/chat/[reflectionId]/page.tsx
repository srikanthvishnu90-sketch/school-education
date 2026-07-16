import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { hasReflectionConsent } from "@/app/_world/consentActions";
import { startReflection } from "@/app/_world/reflectionActions";
import { getSessionUser } from "@/app/_world/session";
import ChatFlow from "./ChatFlow";

/**
 * The student's adaptive reflection. Nothing is captured until consent is on file
 * (COPPA): without it the student is sent to the consent screen first. The first
 * move is then computed server-side and the client drives the conversation.
 */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ reflectionId: string }>;
}): Promise<ReactElement> {
  const user = await getSessionUser();
  if (user === null || user.role !== "student") redirect("/signin");

  const { reflectionId } = await params;
  if (!(await hasReflectionConsent())) {
    redirect(`/consent?next=${encodeURIComponent(`/chat/${reflectionId}`)}`);
  }

  const initial = await startReflection(reflectionId);
  return <ChatFlow initial={initial} />;
}
