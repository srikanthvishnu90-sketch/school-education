import Link from "next/link";
import type { ReactElement } from "react";

/**
 * The site footer — trust links on every public surface. A K-12 product is judged
 * first by whether Privacy / Terms / Help / Contact actually resolve, so these are
 * real routes, not "#". `tone` matches the surface it sits on (the dark app shell
 * or the light legal pages).
 */

const LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Help Center", href: "/help" },
  { label: "Contact", href: "/contact" },
] as const;

export default function SiteFooter({
  tone = "dark",
}: {
  tone?: "dark" | "light";
}): ReactElement {
  const wordmark = tone === "dark" ? "text-shell-text" : "text-ink-black";
  const muted = tone === "dark" ? "text-shell-muted" : "text-secondary";
  const hover =
    tone === "dark" ? "hover:text-shell-text" : "hover:text-ink-black";
  const border = tone === "dark" ? "border-shell-border" : "border-ink-wash";

  return (
    <footer
      className={`flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t ${border} px-6 py-6 text-[12px] ${muted}`}
    >
      <span className={`text-[14px] font-semibold tracking-[0.02em] ${wordmark}`}>
        plumb
      </span>
      <nav className="flex flex-wrap gap-x-6 gap-y-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`transition-colors ${hover}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      <span>© 2026 plumb · All rights reserved.</span>
    </footer>
  );
}
