import type { ImportedRoster, RosterSource } from "@/domain/ports/rostering";

/**
 * Google Classroom roster source — a DEFERRED external integration.
 *
 * The seam is complete: this file implements the RosterSource port, reads its feature
 * flag from env, and fails closed with an actionable error whenever it cannot honestly
 * import. What it deliberately does NOT do is fabricate a working Google integration.
 * There is no `googleapis` dependency, no OAuth client, and no network call in this repo,
 * because the credentials to make one real do not exist in this environment.
 *
 * TO COMPLETE THE INTEGRATION, a real deployment adds exactly two things:
 *   1. An OAuth2 client authorised for the scope
 *        https://www.googleapis.com/auth/classroom.rosters.readonly
 *      built from GOOGLE_CLASSROOM_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN.
 *   2. One paginated read:
 *        GET https://classroom.googleapis.com/v1/courses/{courseId}/students
 *      following `nextPageToken` until exhausted, mapping each student
 *        userId               -> ImportedStudent.externalId
 *        profile.name.fullName -> ImportedStudent.displayName
 *      and returning { source: "google_classroom", courseId, students }.
 *
 * Names imported this way then flow through the app's existing `saveRoster`, which
 * refreshes the PII-redaction snapshot — this source populates the roster, it does not
 * bypass redaction or the consent gate.
 */

/** The three credentials a live Google Classroom import requires, read from env. */
const REQUIRED_ENV = [
  "GOOGLE_CLASSROOM_CLIENT_ID",
  "GOOGLE_CLASSROOM_CLIENT_SECRET",
  "GOOGLE_CLASSROOM_REFRESH_TOKEN",
] as const;

export interface GoogleClassroomConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** The OAuth scope a live import must hold — read-only roster access, nothing more. */
export const GOOGLE_CLASSROOM_SCOPE =
  "https://www.googleapis.com/auth/classroom.rosters.readonly";

/** Read the config from env at call time (never at module load), or null if incomplete. */
function readConfigFromEnv(): GoogleClassroomConfig | null {
  const clientId = process.env.GOOGLE_CLASSROOM_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLASSROOM_CLIENT_SECRET ?? "";
  const refreshToken = process.env.GOOGLE_CLASSROOM_REFRESH_TOKEN ?? "";
  if (clientId === "" || clientSecret === "" || refreshToken === "") return null;
  return { clientId, clientSecret, refreshToken };
}

/** Which required env vars are missing, for a precise unconfigured error. */
function missingEnv(): string[] {
  return REQUIRED_ENV.filter((name) => (process.env[name] ?? "") === "");
}

export function createGoogleClassroomRosterSource(
  config?: GoogleClassroomConfig,
): RosterSource {
  const resolve = (): GoogleClassroomConfig | null => config ?? readConfigFromEnv();
  return {
    kind: "google_classroom",
    isConfigured(): boolean {
      return resolve() !== null;
    },
    async importRoster(courseId: string): Promise<ImportedRoster> {
      if (resolve() === null) {
        // FAIL CLOSED: name exactly what a deployment must set, and never return data.
        throw new Error(
          `Google Classroom roster import is not configured. Set ${missingEnv().join(
            ", ",
          )} in the environment to enable it (OAuth2 scope ${GOOGLE_CLASSROOM_SCOPE}).`,
        );
      }
      // Credentials are present, but no real Google client is wired in this build. Fail
      // closed rather than fabricate students. See the file-top comment for the exact
      // OAuth + single paginated API call a real deployment adds here.
      throw new Error(
        `NOT_IMPLEMENTED: Google Classroom roster import for course "${courseId}" is a ` +
          "deferred external integration. Complete it with an OAuth2 client for scope " +
          `${GOOGLE_CLASSROOM_SCOPE}, then GET ` +
          `https://classroom.googleapis.com/v1/courses/${courseId}/students (paginated), ` +
          "mapping userId -> externalId and profile.name.fullName -> displayName. This " +
          "build adds no googleapis dependency and makes no network call.",
      );
    },
  };
}
