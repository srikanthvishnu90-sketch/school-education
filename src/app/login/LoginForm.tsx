"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactElement } from "react";
import {
  signInWithPassword,
  signUpStudent,
  type LoginRole,
} from "@/app/_world/loginActions";

/**
 * The login form. It really checks the password (salted scrypt on the server) and
 * routes by the account's role. Students can also create an account; teachers are
 * provisioned, so the teacher screen is sign-in only.
 */
export default function LoginForm({
  role,
  demoPassword,
}: {
  role: LoginRole;
  demoPassword: string;
}): ReactElement {
  const router = useRouter();
  const isStudent = role === "student";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const destination = isStudent ? "/courses" : "/lessons";

  // Warm the destination while they type, so the post-login jump is instant.
  useEffect(() => {
    router.prefetch(destination);
  }, [router, destination]);

  const signingUp = mode === "signup" && isStudent;

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const result = signingUp
        ? await signUpStudent(email, password)
        : await signInWithPassword(email, password, role);
      if (result.ok && result.redirect !== undefined) {
        router.push(result.redirect);
      } else {
        setError(
          result.error ??
            "We couldn’t sign you in. Check your email and password, then try again.",
        );
      }
    });
  }

  const demoEmail = isStudent ? "avery@demo.school" : "rivera@demo.school";

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
          className="h-11 rounded-xl border border-shell-border bg-shell-panel px-4 text-[14px] text-shell-text outline-none placeholder:text-shell-muted focus:border-shell-accent/60"
        />

        <label className="mt-2 text-[13px] text-shell-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="h-11 rounded-xl border border-shell-border bg-shell-panel px-4 text-[14px] text-shell-text outline-none placeholder:text-shell-muted focus:border-shell-accent/60"
        />

        {error !== null && (
          <p
            role="alert"
            className="rounded-control border border-warm/50 bg-warm/5 px-3 py-2 text-[13px] text-ink-black"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-11 rounded-full bg-shell-accent text-[14px] font-medium text-shell-background transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {pending
            ? signingUp
              ? "Creating account…"
              : "Signing in…"
            : signingUp
              ? "Create account"
              : `Continue as ${isStudent ? "student" : "teacher"}`}
        </button>
      </form>

      {isStudent && (
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="mt-4 w-full text-center text-[13px] text-shell-accent hover:underline"
        >
          {mode === "signin"
            ? "New here? Create a student account"
            : "Already have an account? Sign in"}
        </button>
      )}

      <p className="mt-5 text-center text-[12px] leading-relaxed text-shell-muted">
        Demo account: <span className="text-shell-text">{demoEmail}</span> ·
        password <span className="text-shell-text">{demoPassword}</span>
      </p>
    </>
  );
}
