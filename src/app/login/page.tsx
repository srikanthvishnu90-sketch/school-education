import Link from "next/link";
import type { ReactElement } from "react";

/**
 * The login shell. Deliberately NO auth logic yet — the form is a shape, not a
 * mechanism (Supabase lands later). The working sign-in still lives at /signin,
 * and is linked below so the product stays reachable while this is a stub.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<ReactElement> {
  const { role } = await searchParams;
  const isStudent = role === "student";
  const title = isStudent ? "Student login" : "Teacher login";
  const blurb = isStudent
    ? "Talk through how the lesson really went."
    : "Record the day, and read the class back.";

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center bg-shell-background px-4 text-shell-text">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="text-[13px] text-shell-muted underline-offset-4 hover:text-shell-text hover:underline"
        >
          ← Back
        </Link>

        <h1 className="mt-6 text-[28px] font-normal tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] text-shell-muted">{blurb}</p>

        <form className="mt-8 flex flex-col gap-3">
          <label className="text-[13px] text-shell-muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@school.org"
            className="h-12 rounded-xl border border-shell-border bg-shell-panel px-4 text-[15px] text-shell-text outline-none placeholder:text-shell-muted focus:border-white/30"
          />

          <label className="mt-2 text-[13px] text-shell-muted" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-12 rounded-xl border border-shell-border bg-shell-panel px-4 text-[15px] text-shell-text outline-none placeholder:text-shell-muted focus:border-white/30"
          />

          <button
            type="button"
            className="mt-4 h-12 rounded-full bg-white text-[15px] font-medium text-black transition-opacity hover:opacity-80"
          >
            Continue as {isStudent ? "student" : "teacher"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-shell-muted">
          Not wired up yet.{" "}
          <Link
            href="/signin"
            className="text-shell-text underline underline-offset-4 hover:opacity-80"
          >
            Use a demo account
          </Link>{" "}
          to get in today.
        </p>
      </div>
    </main>
  );
}
