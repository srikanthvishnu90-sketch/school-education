import type { RosterSource } from "@/domain/ports/rostering";
import { createManualRosterSource } from "./manualRosterSource";
import { createGoogleClassroomRosterSource } from "./googleClassroomRosterSource";

export * from "@/domain/ports/rostering";
export { createManualRosterSource } from "./manualRosterSource";
export {
  createGoogleClassroomRosterSource,
  GOOGLE_CLASSROOM_SCOPE,
  type GoogleClassroomConfig,
} from "./googleClassroomRosterSource";

/**
 * Pick the roster source. Mirrors the env-driven backend selection in `rosterNames`:
 * when the Google Classroom credentials are present, that source wins; otherwise fall
 * back to the manual paste flow (which needs the pasted text). The feature flag is the
 * presence of the Google credentials, so an unconfigured deployment silently stays
 * manual — no dead "import from Google" button that can only error.
 */
export function rosterSourceFor(input: { rosterText: string }): RosterSource {
  const google = createGoogleClassroomRosterSource();
  if (google.isConfigured()) return google;
  return createManualRosterSource(input.rosterText);
}
