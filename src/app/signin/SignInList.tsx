"use client";

import { ArrowRight, AtSign, GraduationCap, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement, type ComponentType } from "react";
import Wordmark from "@/app/_ui/Wordmark";
import { requestMagicLink } from "@/app/_world/authActions";
import { signIn, signOutAction } from "@/app/_world/session";
import { CRISIS_DISCLOSURE } from "@/compliance/disclosure";

/**
 * Sign-in — the front door. It splits cleanly by who you are: teachers on one
 * side, students on the other, so the two very different surfaces are chosen up
 * front. Real sign-in is a magic link to a provisioned school email; the quick
 * demo accounts sit under each role. Both set the same http-only cookie. Rendered
 * on the app's dark shell (near-black surface, sage accent) in the site font.
 */
export interface SignInEntry {
  id: string;
  name: string;
  role: string;
  href: string;
}

export interface CurrentUser {
  name: string;
  role: string;
  href: string;
}

/** Initial for the avatar chip — last word of the name ("Ms. Rivera" → R). */
function initialOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? name[0] ?? "?").toUpperCase();
}

export default function SignInList({
  entries,
  current = null,
  demo = false,
}: {
  entries: SignInEntry[];
  /** The signed-in user, if any — shows a "continue" shortcut without hiding roles. */
  current?: CurrentUser | null;
  /** True on a sample-data demo deployment — shows the one-click personas + a banner. */
  demo?: boolean;
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [codeRejected, setCodeRejected] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  // With no demo personas, the school-email form is the only way in — open it directly.
  const [showEmail, setShowEmail] = useState(!demo);

  function pick(entry: SignInEntry): void {
    startTransition(async () => {
      await signIn(entry.id);
      router.push(entry.href);
    });
  }

  function sendLink(): void {
    if (email.trim().length === 0) return;
    startTransition(async () => {
      const result = await requestMagicLink(email, code.trim() || undefined);
      if (result.codeRejected === true) {
        setCodeRejected(true);
        return;
      }
      setCodeRejected(false);
      setSent(true);
      setDevLink(result.devLink ?? null);
    });
  }

  const teachers = entries.filter((e) => e.role === "Teacher");
  const students = entries.filter((e) => e.role === "Student");
  const others = entries.filter(
    (e) => e.role !== "Teacher" && e.role !== "Student",
  );

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-shell-background text-shell-text">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8 sm:py-10">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <span className="text-[12px] font-medium uppercase tracking-[0.2em] text-shell-muted">
            plumb · classroom reflection
          </span>
          <Link
            href="/"
            className="text-[13px] text-shell-muted transition-colors hover:text-shell-text"
          >
            Home
          </Link>
        </header>

        {/* Headline */}
        <div className="mt-12 sm:mt-16">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-shell-text sm:text-5xl">
            See how the class really went.
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-shell-muted">
            Students talk through a lesson one question at a time and leave with one
            next step they choose; teachers read the whole class back as a single,
            honest brief.{" "}
            <span className="font-semibold text-shell-text">
              No ranking, no diagnosis, no surveillance.
            </span>
          </p>
          <div className="mt-6 h-[3px] w-24 rounded-full bg-shell-accent" />
        </div>

        {demo && (
          <div className="mt-8 rounded-2xl border border-shell-accent/40 bg-shell-accent/10 px-5 py-3 text-[13px] leading-relaxed text-shell-text">
            <span className="font-semibold">Demo environment — sample data only.</span>{" "}
            The one-click accounts below are fictional and hold no real student data.
            A real school signs in with a school email.
          </div>
        )}

        {/* Already signed in — continue or switch, without hiding roles */}
        {current !== null && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-shell-border bg-shell-card px-5 py-4">
            <p className="text-[14px] text-shell-muted">
              You&rsquo;re signed in as{" "}
              <span className="font-medium text-shell-text">{current.name}</span>{" "}
              <span className="text-shell-muted">({current.role})</span>.
            </p>
            <div className="flex items-center gap-4">
              <Link
                href={current.href}
                className="inline-flex min-h-9 items-center rounded-full bg-shell-accent px-4 text-[13px] font-medium text-shell-background transition-opacity hover:opacity-90"
              >
                Continue to your workspace →
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-[13px] text-shell-muted hover:text-shell-text"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Role cards — demo personas only (gated behind SHOW_DEMO_PERSONAS) */}
        {demo && (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <RolePanel
              title="I'm a teacher"
              blurb="Add today's lesson, photos, and scores — and read the class back."
              Icon={GraduationCap}
              topAccent="border-t-shell-text/70"
              people={teachers}
              pending={pending}
              onPick={pick}
            />
            <RolePanel
              title="I'm a student"
              blurb="Talk through how the lesson really went, one question at a time."
              Icon={UserRound}
              topAccent="border-t-shell-accent"
              people={students}
              pending={pending}
              onPick={pick}
            />
          </div>
        )}

        {/* School email — magic link */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-shell-border bg-shell-card">
          {!showEmail && !sent ? (
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              className="flex w-full items-center justify-center gap-2.5 px-5 py-4 text-[14px] text-shell-text transition-colors hover:bg-white/5"
            >
              <AtSign size={16} aria-hidden className="text-shell-muted" />
              Sign in with your school email instead
              <ArrowRight size={15} aria-hidden className="text-shell-muted" />
            </button>
          ) : sent ? (
            <p
              role="status"
              aria-live="polite"
              className="px-5 py-5 text-[14px] leading-relaxed text-shell-muted"
            >
              If that email has an account, a sign-in link is on its way. Check your
              inbox.
              {devLink !== null && (
                <>
                  {" "}
                  <a
                    href={devLink}
                    className="text-shell-accent underline-offset-4 hover:underline"
                  >
                    Open your link
                  </a>
                  <span className="block text-[12px] opacity-70">
                    (shown in dev only)
                  </span>
                </>
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5 px-5 py-5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-shell-text"
              >
                Sign in with your school email
              </label>
              <div className="flex gap-2">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.org"
                  className="flex-1 rounded-lg border border-shell-border bg-shell-panel px-3 py-2 text-[15px] text-shell-text outline-none placeholder:text-shell-muted focus:border-shell-accent"
                />
                <button
                  type="button"
                  onClick={sendLink}
                  disabled={pending || email.trim().length === 0}
                  className="rounded-lg bg-shell-accent px-4 py-2 text-sm font-medium text-shell-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? "Sending…" : "Send link"}
                </button>
              </div>
              <input
                id="pilot-code"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeRejected(false);
                }}
                placeholder="Pilot access code (if you were given one)"
                aria-label="Pilot access code"
                aria-invalid={codeRejected}
                className="rounded-lg border border-shell-border bg-shell-panel px-3 py-2 text-[14px] text-shell-text outline-none placeholder:text-shell-muted focus:border-shell-accent"
              />
              {codeRejected && (
                <p role="alert" className="text-[13px] text-shell-muted">
                  That access code isn’t valid for this pilot. Check the code from
                  your invite and try again.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Staff */}
        {others.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-shell-muted">
            <span>Staff:</span>
            {others.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o)}
                disabled={pending}
                className="text-shell-accent hover:underline disabled:opacity-50"
              >
                {o.name} ({o.role})
              </button>
            ))}
          </div>
        )}

        {/* Hero band */}
        <div className="relative mt-9 flex h-44 items-center justify-center overflow-hidden rounded-2xl border border-shell-border bg-gradient-to-br from-shell-card via-shell-sidebar to-shell-background sm:h-52">
          <div
            aria-hidden
            className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-shell-accent/10 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute bottom-4 left-6 h-16 w-40 rounded-lg border border-shell-border/70 bg-white/[0.02] sm:h-20 sm:w-56"
          />
          <div
            aria-hidden
            className="absolute right-8 top-6 h-14 w-28 rounded-lg border border-shell-border/70 bg-white/[0.02] sm:h-16 sm:w-40"
          />
          <p className="relative z-10 max-w-md px-4 text-center text-[14px] font-medium leading-relaxed text-shell-muted">
            Read the lesson honestly, then choose one next step.
          </p>
        </div>

        {/* Safety disclosure */}
        <p className="mt-7 max-w-3xl text-[13px] leading-relaxed text-shell-muted">
          {CRISIS_DISCLOSURE}
        </p>

        {/* Footer */}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-shell-border pt-6 text-[12px] text-shell-muted">
          <Wordmark size="sm" tone="dark" href="/" className="text-shell-text" />
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms of Service", href: "/terms" },
              { label: "Help Center", href: "/help" },
              { label: "Contact", href: "/contact" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-shell-text"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span>© 2026 Plumb Reflection · All rights reserved.</span>
        </footer>
      </div>
    </main>
  );
}

function RolePanel({
  title,
  blurb,
  Icon,
  topAccent,
  people,
  pending,
  onPick,
}: {
  title: string;
  blurb: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  topAccent: string;
  people: SignInEntry[];
  pending: boolean;
  onPick: (e: SignInEntry) => void;
}): ReactElement {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-t-2 border-shell-border bg-shell-card p-6 ${topAccent}`}
    >
      <Icon size={22} aria-hidden className="text-shell-text" />
      <h2 className="mt-4 text-[19px] font-semibold text-shell-text">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-shell-muted">{blurb}</p>
      <div className="mt-5 flex flex-col gap-2.5">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            disabled={pending}
            className="flex items-center gap-3 rounded-xl border border-shell-border bg-shell-panel/40 px-3.5 py-3 text-left transition-colors hover:border-shell-accent disabled:opacity-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shell-active text-[13px] font-medium text-shell-text">
              {initialOf(p.name)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] text-shell-text">
              {p.name}
            </span>
            <ArrowRight size={16} aria-hidden className="shrink-0 text-shell-muted" />
          </button>
        ))}
      </div>
    </section>
  );
}
