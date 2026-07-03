import { NextResponse, type NextRequest } from "next/server";
import { verifyMagicLink } from "@/app/_world/authActions";

/**
 * Magic-link landing (p5). A Route Handler — NOT a page — because it establishes
 * the session cookie, which may only be set in a Route Handler or Server Action.
 * A valid one-time token signs the user in and redirects to their surface; a
 * stale, reused, or missing token calmly returns to sign-in.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (token !== null) {
    const result = await verifyMagicLink(token);
    if (result.ok && result.redirect !== undefined) {
      return NextResponse.redirect(new URL(result.redirect, request.url));
    }
  }
  return NextResponse.redirect(new URL("/signin", request.url));
}
