import { Camera, ClipboardList, MessageSquareText } from "lucide-react";
import type { ReactElement } from "react";
import type { Role } from "./RoleToggle";

/**
 * Three example rows under the composer. They mirror what each side actually
 * does once signed in, so the choice above visibly changes what the product is
 * for — teachers record a day, students talk one through.
 */

const ACTIONS: Record<Role, { label: string; Icon: typeof Camera }[]> = {
  teacher: [
    { label: "Add today's lesson", Icon: ClipboardList },
    { label: "Attach photos of the board", Icon: Camera },
    { label: "Read the class back", Icon: MessageSquareText },
  ],
  student: [
    { label: "Reflect on today's lesson", Icon: MessageSquareText },
    { label: "See what you noticed", Icon: ClipboardList },
    { label: "Check your read vs. your results", Icon: Camera },
  ],
};

export default function QuickActions({ role }: { role: Role }): ReactElement {
  return (
    <ul className="mt-4 flex w-full flex-col">
      {ACTIONS[role].map(({ label, Icon }) => (
        <li key={label}>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-shell-muted">
              <Icon size={16} aria-hidden />
            </span>
            <span className="text-[14px] text-shell-text">{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
