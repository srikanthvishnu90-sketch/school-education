"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import type { Role } from "./RoleToggle";

/**
 * The only high-contrast element on the page: a white pill on near-black. It
 * carries the currently selected role into the login flow, so the toggle above
 * is what decides which door you walk through.
 */
export default function LoginButton({ role }: { role: Role }): ReactElement {
  return (
    <Link
      href={`/signin?role=${role}`}
      className="inline-flex h-10 items-center rounded-full bg-shell-sage px-5 text-[14px] font-medium text-shell-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-sage/60"
    >
      Sign in
    </Link>
  );
}
