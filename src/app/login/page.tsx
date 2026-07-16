import Link from "next/link";
import type { ReactElement } from "react";
import type { LoginRole } from "@/app/_world/loginActions";
import LoginForm from "./LoginForm";

/**
 * The login screen. The role comes from the landing toggle via ?role=, so the
 * door you picked is the door you walk through.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}): Promise<ReactElement> {
  const { role } = await searchParams;
  const resolved: LoginRole = role === "student" ? "student" : "teacher";
  const isStudent = resolved === "student";

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center bg-shell-background px-4 text-shell-text">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="text-[13px] text-shell-muted underline-offset-4 hover:text-shell-text hover:underline"
        >
          ← Back
        </Link>

        <h1 className="mt-6 text-[24px] font-normal tracking-tight">
          {isStudent ? "Student login" : "Teacher login"}
        </h1>
        <p className="mt-2 text-[14px] text-shell-muted">
          {isStudent
            ? "Talk through how the lesson really went."
            : "Record the day, and read the class back."}
        </p>

        <LoginForm role={resolved} />
      </div>
    </main>
  );
}
