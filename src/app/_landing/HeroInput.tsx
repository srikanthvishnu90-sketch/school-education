import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";
import PlumbLine from "@/app/_ui/PlumbLine";
import type { Role } from "./RoleToggle";

/**
 * The honest hero call-to-action. There is nothing to type here while signed
 * out — a reflection only begins after you sign in — so this is a plain door,
 * not a disabled composer dressed up to look interactive. The plumb line above
 * names the promise: settle to what's actually true. The button carries the
 * selected role into the sign-in flow, so the toggle decides which door opens.
 */
export default function HeroInput({ role }: { role: Role }): ReactElement {
  return (
    <div className="flex flex-col items-center gap-5">
      <PlumbLine height={64} drop className="text-shell-muted" />
      <Link
        href={`/signin?role=${role}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-shell-accent px-6 text-[15px] font-medium text-shell-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shell-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-shell-background"
      >
        Sign in to start
        <ArrowRight size={16} aria-hidden />
      </Link>
      <p className="text-[13px] text-shell-muted">
        Your reflection begins once you sign in.
      </p>
    </div>
  );
}
