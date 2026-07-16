import { AudioLines, Mic, Plus } from "lucide-react";
import type { ReactElement } from "react";

/**
 * The composer, as a visual stub. It is deliberately INERT until you sign in —
 * a signed-out visitor should see the shape of the thing, never start typing a
 * reflection that would be dropped on the floor.
 */
export default function HeroInput({
  placeholder = "Ask plumb",
}: {
  placeholder?: string;
}): ReactElement {
  return (
    <div
      className="flex h-14 w-full items-center gap-3 rounded-full border border-shell-border bg-shell-panel px-4"
      aria-hidden
    >
      <Plus size={20} className="shrink-0 text-shell-muted" />
      <input
        disabled
        placeholder={placeholder}
        tabIndex={-1}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-shell-text outline-none placeholder:text-shell-muted disabled:cursor-not-allowed"
      />
      <Mic size={20} className="shrink-0 text-shell-muted" />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
        <AudioLines size={18} className="text-black" />
      </span>
    </div>
  );
}
