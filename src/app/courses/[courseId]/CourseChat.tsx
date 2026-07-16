"use client";

import { ArrowUp } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import { sendAssistantMessage } from "@/app/_world/assistantActions";
import type { AssistantMessage } from "@/app/_world/assistant";
import { CRISIS_DISCLOSURE } from "@/compliance/disclosure";

/**
 * The open study chat for a course — a GPT-style thread the student can talk in
 * freely. It opens with a warm-up question and answers back one turn at a time.
 * Every send is crisis-screened server-side before it reaches any model; a hit
 * flips this into the calm resource state. Kept task-focused and reward-free.
 */
export default function CourseChat({
  courseId,
  courseName,
  studentName,
}: {
  courseId: string;
  courseName: string;
  studentName: string;
}): ReactElement {
  const opening = `Hi ${studentName} — I'm here to think through ${courseName} with you. How did today go? Tell me one thing that clicked and one thing that felt tricky.`;
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { role: "assistant", text: opening },
  ]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [crisis, setCrisis] = useState(false);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function send(): void {
    const text = input.trim();
    if (text.length === 0 || pending || crisis) return;
    setError(null);
    const history = messages;
    setMessages((prev) => [...prev, { role: "student", text }]);
    setInput("");
    startTransition(async () => {
      try {
        const turn = await sendAssistantMessage(courseId, history, text);
        setMessages((prev) => [...prev, { role: "assistant", text: turn.reply }]);
        if (turn.crisis) setCrisis(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-1 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "student" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "student"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-shell-panel px-4 py-2.5 text-[14px] leading-relaxed text-shell-text"
                    : "max-w-[90%] text-[15px] leading-relaxed text-shell-text"
                }
              >
                {m.text}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <span className="text-[14px] text-shell-muted">thinking…</span>
            </div>
          )}
          {crisis && (
            <div className="rounded-xl border border-shell-border bg-shell-panel px-4 py-3 text-[13px] leading-relaxed text-shell-muted">
              {CRISIS_DISCLOSURE}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-1 pb-4">
        {error !== null && (
          <p className="mb-2 text-[13px] text-shell-text">{error}</p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-shell-border bg-shell-panel px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            disabled={crisis}
            placeholder={crisis ? "Someone will check in with you soon." : `Ask about ${courseName}, or think out loud…`}
            className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-shell-text outline-none placeholder:text-shell-muted disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || crisis || input.trim().length === 0}
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shell-sage text-shell-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp size={17} />
          </button>
        </div>
        <p className="mt-2 text-center text-[12px] text-shell-muted">
          This chat is private and never changes your grade. If you mention being in danger,
          a caring adult is told so you can get help.
        </p>
      </div>
    </div>
  );
}
