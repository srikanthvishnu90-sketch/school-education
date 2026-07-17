"use client";

import { ArrowLeft, Menu, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement, type ReactNode } from "react";
import Sidebar from "@/app/_landing/Sidebar";
import type { AssistantMessage } from "@/app/_world/assistant";
import type { CourseReflection } from "@/app/_world/courseActions";
import type { Course } from "@/app/_world/courses";
import CourseChat from "./CourseChat";

/**
 * One course, as a single chatbox with two tabs, exactly as a student expects
 * after clicking a class: "Today's reflection" (the guided conversation the
 * teacher's lesson seeds) and "Ask for help" (an open, private study chat). The
 * reflection is structured and teacher-seeded; the chat is free-form and
 * reward-free. The chat stays mounted across tab switches so a conversation is
 * never lost by tabbing away.
 */

type Tab = "reflection" | "chat";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Start reflection",
  active: "Continue",
  completed: "Review",
  escalated: "Open",
  abandoned: "Closed",
};

export default function CourseShell({
  course,
  reflections,
  studentName,
  chatHistory,
}: {
  course: Course;
  reflections: CourseReflection[];
  studentName: string;
  chatHistory: AssistantMessage[];
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("reflection");
  const initials = studentName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const openCount = reflections.filter((r) => r.status !== "completed").length;

  return (
    <div className="flex h-[100svh] overflow-hidden bg-shell-background text-shell-text">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={{ name: studentName, plan: "Student", initials }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
          >
            <Menu size={18} />
          </button>
          <Link
            href="/courses"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-shell-muted hover:text-shell-text"
          >
            <ArrowLeft size={14} aria-hidden />
            My courses
          </Link>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-4 pb-2">
          <div className="mx-auto w-full max-w-2xl shrink-0 pt-1">
            <h1 className="text-[22px] font-normal tracking-tight sm:text-[26px]">
              {course.name}
            </h1>
            <p className="mt-1 text-[13px] text-shell-muted">
              {course.code} · {course.teacher}
            </p>

            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Reflection or chat"
              className="mt-4 flex gap-1 border-b border-shell-border"
            >
              <TabButton
                active={tab === "reflection"}
                onClick={() => setTab("reflection")}
                badge={openCount > 0 ? openCount : undefined}
              >
                Today&rsquo;s reflection
              </TabButton>
              <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
                Ask for help
              </TabButton>
            </div>
          </div>

          {/* Reflection panel */}
          <section
            role="tabpanel"
            aria-label="Today's reflection"
            hidden={tab !== "reflection"}
            className={
              tab === "reflection"
                ? "mx-auto w-full max-w-2xl overflow-y-auto pt-5"
                : "hidden"
            }
          >
            {reflections.length === 0 ? (
              <p className="rounded-xl border border-shell-border bg-shell-card px-4 py-5 text-[14px] leading-relaxed text-shell-muted">
                Nothing to reflect on yet. When {course.teacher} posts a lesson, it
                shows up here — and you can always use{" "}
                <button
                  type="button"
                  onClick={() => setTab("chat")}
                  className="text-shell-sage hover:underline"
                >
                  Ask for help
                </button>{" "}
                to think the class through.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {reflections.map((r) => (
                  <li key={r.reflectionId}>
                    <Link
                      href={`/chat/${r.reflectionId}`}
                      className="flex items-center gap-3 rounded-xl border border-shell-border bg-shell-card px-4 py-3.5 text-left transition-colors hover:border-shell-sage"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-shell-muted">
                        <MessageSquareText size={16} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-shell-text">
                        {r.title}
                      </span>
                      <span className="shrink-0 text-[13px] text-shell-sage">
                        {STATUS_LABEL[r.status] ?? "Open"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Chat panel — stays mounted (hidden, not unmounted) so state survives */}
          <div
            role="tabpanel"
            aria-label="Ask for help"
            hidden={tab !== "chat"}
            className={tab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
          >
            <CourseChat
              courseId={course.id}
              courseName={course.name}
              studentName={studentName}
              initial={chatHistory}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] transition-colors ${
        active
          ? "border-shell-sage text-shell-text"
          : "border-transparent text-shell-muted hover:text-shell-text"
      }`}
    >
      {children}
      {badge !== undefined && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-shell-sage px-1.5 text-[11px] font-medium text-shell-background">
          {badge}
        </span>
      )}
    </button>
  );
}
