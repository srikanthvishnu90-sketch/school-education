import type { ReactElement } from "react";
import { startReflection } from "@/app/_world/reflectionActions";
import ChatFlow from "./ChatFlow";

/**
 * The student's adaptive reflection. The first move is computed server-side, then
 * the client drives the one-question-at-a-time conversation.
 */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ reflectionId: string }>;
}): Promise<ReactElement> {
  const { reflectionId } = await params;
  const initial = await startReflection(reflectionId);
  return <ChatFlow initial={initial} />;
}
