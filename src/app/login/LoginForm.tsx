"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement } from "react";
import { loginAs, type LoginRole } from "@/app/_world/loginActions";

/**
 * The login form. It establishes the real session cookie for the chosen role and
 * routes to that role's product. It does NOT check the password yet, and says so
 * — a form that silently ignores the credential it asked for is worse than one
 * that admits it.
 */
export default function LoginForm({ role }: { role: LoginRole }): ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isStudent = role === "student";

  function submit(): void {
    setError(null);
    startTransition(async () => {
      try {
        router.push(await loginAs(role));
      } catch {
        setError("We couldn’t sign you in. Try again.");
      }
    });
  }

  return (
    <>
      <form
        className="mt-8 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="text-[13px] text-shell-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.org"
          className="h-11 rounded-xl border border-shell-border bg-shell-panel px-4 text-[14px] text-shell-text outline-none placeholder:text-shell-muted focus:border-white/30"
        />

        <label className="mt-2 text-[13px] text-shell-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="h-11 rounded-xl border border-shell-border bg-shell-panel px-4 text-[14px] text-shell-text outline-none placeholder:text-shell-muted focus:border-white/30"
        />

        {error !== null && (
          <p className="text-[13px] text-shell-text">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-11 rounded-full bg-white text-[14px] font-medium text-black transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Signing in…" : `Continue as ${isStudent ? "student" : "teacher"}`}
        </button>
      </form>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-shell-muted">
        Demo sign-in — your password isn’t checked yet, so any email gets you in
        as the {isStudent ? "demo student" : "demo teacher"}.
      </p>
    </>
  );
}
