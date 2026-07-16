"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { requestMagicLink } from "@/app/_world/authActions";
import { signIn } from "@/app/_world/session";
import { CRISIS_DISCLOSURE } from "@/compliance/disclosure";

/**
 * Sign-in — the front door. It splits cleanly by who you are: teachers on one
 * side, students on the other, so the two very different surfaces are chosen up
 * front. Real sign-in is a magic link to a provisioned school email; the quick
 * demo accounts sit under each role. Both set the same http-only cookie.
 */
export interface SignInEntry {
  id: string;
  name: string;
  role: string;
  href: string;
}

export default function SignInList({
  entries,
}: {
  entries: SignInEntry[];
}): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [codeRejected, setCodeRejected] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);

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
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
        <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
          plumb · classroom reflection
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-black">
          See how the class really went.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-secondary">
          Students talk through a lesson one question at a time and leave with one
          next step they choose; teachers read the whole class back as a single,
          honest brief. No ranking, no diagnosis, no surveillance.
        </p>
        <p className="mt-5 text-[13px] font-medium text-ink-black">
          How are you here today?
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <RolePanel
            title="I'm a teacher"
            blurb="Add today's lesson, photos, and scores — and read the class back."
            accent
            people={teachers}
            pending={pending}
            onPick={pick}
          />
          <RolePanel
            title="I'm a student"
            blurb="Talk through how the lesson really went, one question at a time."
            people={students}
            pending={pending}
            onPick={pick}
          />
        </div>

        {/* Real sign-in: magic link — secondary, revealed on demand. */}
        <div className="mt-6 rounded-card border border-ink-wash bg-white p-5">
          {!showEmail && !sent ? (
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              className="text-[14px] text-ink-tint hover:underline"
            >
              Sign in with your school email instead →
            </button>
          ) : sent ? (
            <p className="text-[14px] leading-relaxed text-secondary">
              If that email has an account, a sign-in link is on its way. Check your
              inbox.
              {devLink !== null && (
                <>
                  {" "}
                  <a href={devLink} className="text-ink-tint underline-offset-4 hover:underline">
                    Open your link
                  </a>
                  <span className="block text-[12px] opacity-70">(shown in dev only)</span>
                </>
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium text-ink-black">
                Sign in with your school email
              </label>
              <div className="flex gap-2">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.org"
                  className="flex-1 rounded-control border border-ink-wash bg-white px-3 py-2 text-[15px] text-ink-black outline-none focus:border-ink-tint"
                />
                <button
                  type="button"
                  onClick={sendLink}
                  disabled={pending || email.trim().length === 0}
                  className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-tint disabled:opacity-40"
                >
                  Send link
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
                aria-invalid={codeRejected}
                className="rounded-control border border-ink-wash bg-white px-3 py-2 text-[14px] text-ink-black outline-none focus:border-ink-tint"
              />
              {codeRejected && (
                <p className="text-[13px] text-secondary">
                  That access code isn’t valid for this pilot. Check the code from
                  your invite and try again.
                </p>
              )}
            </div>
          )}
        </div>

        {others.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-secondary">
            <span>Staff:</span>
            {others.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o)}
                disabled={pending}
                className="text-ink-tint hover:underline disabled:opacity-50"
              >
                {o.name} ({o.role})
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-[13px] leading-relaxed text-secondary">
          {CRISIS_DISCLOSURE}
        </p>
      </div>
    </main>
  );
}

function RolePanel({
  title,
  blurb,
  people,
  pending,
  onPick,
  accent = false,
}: {
  title: string;
  blurb: string;
  people: SignInEntry[];
  pending: boolean;
  onPick: (e: SignInEntry) => void;
  accent?: boolean;
}): ReactElement {
  return (
    <section
      className={`flex flex-col rounded-card border p-5 ${
        accent ? "border-ink-tint/40 bg-ink-wash/40" : "border-ink-wash bg-white"
      }`}
    >
      <h2 className="text-lg font-medium text-ink-black">{title}</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-secondary">{blurb}</p>
      <div className="mt-4 flex flex-col gap-2">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            disabled={pending}
            className="flex items-center justify-between rounded-control border border-ink-wash bg-white px-4 py-3 text-left text-[15px] text-ink-black transition-colors hover:border-ink-tint disabled:opacity-50"
          >
            <span>{p.name}</span>
            <span aria-hidden className="text-ink-tint">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
