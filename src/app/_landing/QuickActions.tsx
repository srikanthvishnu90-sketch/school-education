import { Camera, ClipboardList, MessageSquareText } from "lucide-react";
import type { ReactElement } from "react";
import type { Role } from "./RoleToggle";

/**
 * What each side actually does once signed in — a plain, honest list so the role
 * toggle above visibly changes what the product is for. These are descriptions,
 * not controls: nothing here is clickable, so a signed-out visitor never taps
 * into a dead end.
 */

const ACTIONS: Record<Role, { label: string; Icon: typeof Camera }[]> = {
  teacher: [
    { label: "Add today's lesson — a few lines is enough", Icon: ClipboardList },
    { label: "Attach photos of the board", Icon: Camera },
    { label: "Read the class back as one brief", Icon: MessageSquareText },
  ],
  student: [
    { label: "Reflect on today's lesson, one question at a time", Icon: MessageSquareText },
    { label: "Notice and name how the work actually went", Icon: ClipboardList },
    { label: "Check how sure you felt against your results over time", Icon: Camera },
  ],
};

export default function QuickActions({ role }: { role: Role }): ReactElement {
  return (
    <ul className="mt-8 flex w-full flex-col gap-1 border-t border-white/5 pt-6">
      {ACTIONS[role].map(({ label, Icon }) => (
        <li key={label} className="flex items-center gap-3 px-1 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-shell-muted">
            <Icon size={16} aria-hidden />
          </span>
          <span className="text-[14px] text-shell-muted">{label}</span>
        </li>
      ))}
    </ul>
  );
}
