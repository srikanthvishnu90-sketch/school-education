"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { requestMagicLink } from "@/app/_world/authActions";
import { signIn } from "@/app/_world/session";
import { Stage } from "@/app/_ui/atoms";
import { CRISIS_DISCLOSURE } from "@/compliance/disclosure";

/**
 * Sign-in. Real sign-in is a magic link to your provisioned school email; the
 * quick-pick demo accounts remain below for demos and testing. Both set the same
 * http-only session cookie server-side.
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
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  function pick(entry: SignInEntry): void {
    startTransition(async () => {
      await signIn(entry.id);
      router.push(entry.href);
    });
  }

  function sendLink(): void {
    if (email.trim().length === 0) return;
    startTransition(async () => {
      const result = await requestMagicLink(email);
      setSent(true);
      setDevLink(result.devLink ?? null);
    });
  }

  return (
    <Stage eyebrow="Sign in" question="Welcome back.">
      {/* Real sign-in: magic link to your school email. */}
      <div className="rounded-card border border-ink-wash bg-white p-5">
        <label htmlFor="email" className="text-sm font-medium text-ink-black">
          Sign in with your school email
        </label>
        {sent ? (
          <p className="mt-3 text-[14px] leading-relaxed text-secondary">
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
          <div className="mt-2 flex gap-2">
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
        )}
      </div>

      {/* Quick-pick demo accounts. */}
      <p className="mb-3 mt-8 text-[13px] uppercase tracking-[0.16em] text-secondary">
        Or try a demo account
      </p>
      <div className="grid gap-2">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => pick(entry)}
            disabled={pending}
            className="flex w-full items-center justify-between rounded-control border border-ink-wash bg-white px-4 py-3 text-left text-[15px] text-ink-black transition-colors hover:border-ink-tint/50 disabled:opacity-50"
          >
            <span>{entry.name}</span>
            <span className="text-[12px] uppercase tracking-[0.16em] text-secondary">
              {entry.role}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-secondary">
        {CRISIS_DISCLOSURE}
      </p>
    </Stage>
  );
}
