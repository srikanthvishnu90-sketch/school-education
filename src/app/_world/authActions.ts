"use server";

import {
  consumeToken,
  devLinksVisible,
  getEmailSender,
  lookupByEmail,
  mintToken,
  pilotGateAccepts,
  type AuthUser,
} from "./authCore";
import { signIn } from "./session";
import { DEMO_REFLECTION_ID } from "./intelligence";

/**
 * Magic-link server actions. `requestMagicLink` never reveals whether an email is
 * provisioned (it always reports "sent") — so it can't be used to enumerate
 * accounts. `verifyMagicLink` consumes the one-time token and establishes the
 * session, returning where the role's surface lives.
 */

async function homeFor(user: AuthUser): Promise<string> {
  if (user.role === "counselor") return "/escalations";
  if (user.role === "teacher") return "/lessons";
  return `/chat/${DEMO_REFLECTION_ID}`;
}

export interface RequestResult {
  sent: boolean;
  /** True when the closed-pilot access code was required and did not match. */
  codeRejected?: true;
  /** In dev only, the link is returned so the flow works without SMTP. */
  devLink?: string;
}

export async function requestMagicLink(
  email: string,
  code?: string,
): Promise<RequestResult> {
  // Closed-pilot gate first. Rejecting a bad shared code is safe to surface (it
  // is not tied to any account); email existence is still never revealed below.
  if (!pilotGateAccepts(email, code)) {
    return { sent: false, codeRejected: true };
  }
  const user = lookupByEmail(email);
  if (user === null) {
    // Don't leak which emails exist; behave identically.
    return { sent: true };
  }
  const token = mintToken(user.email);
  const link = `/auth/verify?token=${encodeURIComponent(token)}`;
  await getEmailSender().send(user.email, link);
  return devLinksVisible() ? { sent: true, devLink: link } : { sent: true };
}

export interface VerifyResult {
  ok: boolean;
  redirect?: string;
}

export async function verifyMagicLink(token: string): Promise<VerifyResult> {
  const email = consumeToken(token);
  if (email === null) return { ok: false };
  const user = lookupByEmail(email);
  if (user === null) return { ok: false };
  await signIn(user.id);
  return { ok: true, redirect: await homeFor(user) };
}
