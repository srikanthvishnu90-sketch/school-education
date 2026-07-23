"use client";

import { ArrowLeft, Menu, MessageSquareText } from "lucide-react";
import Link from "next/link";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
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

const TAB_ORDER: readonly Tab[] = ["reflection", "chat"];
const tabId = (t: Tab): string => `course-tab-${t}`;
const panelId = (t: Tab): string => `course-panel-${t}`;

const STATUS_LABEL: Record<string, string> = {
  not_started: "Start",
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
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    reflection: null,
    chat: null,
  });

  const selectTab = (next: Tab): void => {
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  // Roving-tabindex keyboard navigation for the tablist: arrows move focus AND
  // selection, wrapping around; Home/End jump to the ends.
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = TAB_ORDER.indexOf(tab);
    let nextIndex = current;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (current + 1) % TAB_ORDER.length;
        break;
      case "ArrowLeft":
        nextIndex = (current - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(TAB_ORDER[nextIndex]);
  };

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
        <header className="graph-paper-dark flex shrink-0 items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-shell-muted hover:bg-white/5 hover:text-shell-text md:hidden"
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

        <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col px-4 pb-2">
          <div className="mx-auto w-full max-w-2xl shrink-0 pt-1">
            <h1 className="font-voice text-[22px] font-normal tracking-tight sm:text-[26px]">
              {course.name}
            </h1>
            <p className="mt-1 text-[13px] text-shell-muted">
              {course.code} · {course.teacher}
            </p>

            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Today's check or ask for help"
              onKeyDown={onTabKeyDown}
              className="mt-4 flex gap-1 border-b border-shell-border"
            >
              <TabButton
                tab="reflection"
                active={tab === "reflection"}
                onClick={() => selectTab("reflection")}
                buttonRef={(el) => {
                  tabRefs.current.reflection = el;
                }}
                badge={openCount > 0 ? openCount : undefined}
              >
                Today&rsquo;s check
              </TabButton>
              <TabButton
                tab="chat"
                active={tab === "chat"}
                onClick={() => selectTab("chat")}
                buttonRef={(el) => {
                  tabRefs.current.chat = el;
                }}
              >
                Ask for help
              </TabButton>
            </div>
          </div>

          {/* Reflection panel */}
          <section
            id={panelId("reflection")}
            role="tabpanel"
            aria-labelledby={tabId("reflection")}
            tabIndex={0}
            hidden={tab !== "reflection"}
            className={
              tab === "reflection"
                ? "mx-auto w-full max-w-2xl overflow-y-auto pt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent"
                : "hidden"
            }
          >
            {reflections.length === 0 ? (
              <p className="rounded-xl border border-shell-border bg-shell-card px-4 py-5 text-[14px] leading-relaxed text-shell-muted">
                Nothing to go through yet. When {course.teacher} posts a lesson, it
                shows up here — and you can always use{" "}
                <button
                  type="button"
                  onClick={() => setTab("chat")}
                  className="text-shell-accent hover:underline"
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
                      className="flex items-center gap-3 rounded-xl border border-shell-border bg-shell-card px-4 py-3.5 text-left transition-colors hover:border-shell-accent"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-shell-muted">
                        <MessageSquareText size={16} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-shell-text">
                        {r.title}
                      </span>
                      <span className="shrink-0 text-[13px] text-shell-accent">
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
            id={panelId("chat")}
            role="tabpanel"
            aria-labelledby={tabId("chat")}
            tabIndex={0}
            hidden={tab !== "chat"}
            className={
              tab === "chat"
                ? "flex min-h-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent"
                : "hidden"
            }
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
  tab,
  active,
  onClick,
  buttonRef,
  badge,
  children,
}: {
  tab: Tab;
  active: boolean;
  onClick: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
  badge?: number;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      id={tabId(tab)}
      ref={buttonRef}
      aria-selected={active}
      aria-controls={panelId(tab)}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent ${
        active
          ? "border-shell-accent text-shell-text"
          : "border-transparent text-shell-muted hover:text-shell-text"
      }`}
    >
      {children}
      {badge !== undefined && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-shell-accent px-1.5 text-[11px] font-medium text-shell-background">
          {badge}
        </span>
      )}
    </button>
  );
}
