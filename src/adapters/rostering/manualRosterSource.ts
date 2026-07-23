import type {
  ImportedRoster,
  ImportedStudent,
  RosterSource,
} from "@/domain/ports/rostering";
import { parseRoster } from "@/app/_world/rosterNames";

/**
 * The manual roster source — the existing "paste one name per line" flow, expressed as
 * one implementation of the RosterSource port. It reuses `parseRoster` (trim, de-dupe,
 * bound) so manual and imported rosters normalise identically, and derives a stable
 * external id by slugging each name so re-importing the same list is idempotent.
 *
 * Names produced here still flow through `saveRoster` at the call site, which refreshes
 * the PII-redaction snapshot — this adapter does not persist and does not bypass consent.
 */

/**
 * A stable, ASCII, url-safe slug for a name — the manual source's externalId. Two
 * imports of the same pasted name always produce the same id. Non-alphanumeric runs
 * (including accents and CJK) collapse to a single dash; the id is a handle, not the
 * display name, so it need not be pretty — only deterministic.
 */
function slugName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createManualRosterSource(rosterText: string): RosterSource {
  return {
    kind: "manual",
    isConfigured(): boolean {
      return true;
    },
    async importRoster(courseId: string): Promise<ImportedRoster> {
      const students: ImportedStudent[] = parseRoster(rosterText).map((name) => ({
        externalId: slugName(name),
        displayName: name,
      }));
      return { source: "manual", courseId, students };
    },
  };
}
