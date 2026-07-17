import type {
  CrisisDeliveryChannel,
  OperatorAlertChannel,
} from "@/safety";
import { isProduction } from "./productionConfig";

/**
 * The REAL crisis channels — an active counselor notification (not just a queue a
 * counselor might never open) and an operator fallback. Email goes out through
 * Resend when RESEND_API_KEY + EMAIL_FROM are set; otherwise it logs (dev). The
 * notification never contains the student's text — that stays encrypted and is read
 * only in the counselor console under access control. The email is a nudge to go
 * review the alert, honoring the "a caring adult will be told" promise.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.APP_URL ??
  "https://awareness-sepia.vercel.app";

/** Send one email. Throws on a hard failure so the caller can flag/retry. */
async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey === undefined || apiKey.length === 0 || from === undefined || from.length === 0) {
    // Unconfigured email must NEVER count as delivered in production — throw so the
    // service's failure path fires (operator alert + undelivered + retry). A crisis
    // notification that silently "succeeded" into a console.log is the exact
    // silent-failure this pipeline exists to prevent. Dev keeps the observable log.
    if (isProduction()) {
      throw new Error(
        "crisis email not configured (RESEND_API_KEY/EMAIL_FROM) — refusing to treat notification as delivered",
      );
    }
    console.log(`[crisis-notify] ${to} :: ${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`crisis email send failed: ${res.status}`);
  }
}

/** Emails each designated counselor an alert to go review the escalation. */
export function createEmailCrisisDeliveryChannel(): CrisisDeliveryChannel {
  const reviewUrl = new URL("/escalations", SITE_URL).toString();
  return {
    async deliver(request) {
      const urgent = request.tier === "tier_1";
      const subject = urgent
        ? "plumb — a student may need immediate support"
        : "plumb — a student may need a check-in";
      const html =
        `<p>A student at your school wrote something in plumb that may signal they need support.</p>` +
        `<p><strong>What you wrote will not be in this email.</strong> Sign in to plumb to review the alert privately and check in with the student.</p>` +
        `<p><a href="${reviewUrl}">Open the counselor console</a></p>` +
        (urgent
          ? `<p>If a student may be in immediate danger, contact emergency services now; in the U.S. you can call or text 988.</p>`
          : "");
      // Deliver to every designated counselor; a single failure fails the attempt
      // (the service then alerts the operator and flags it for retry).
      for (const contact of request.contacts) {
        await sendMail(contact.handle, subject, html);
      }
    },
  };
}

/** The last-resort operator alert, when an escalation can't reach a counselor. */
export function createEmailOperatorChannel(): OperatorAlertChannel {
  const operatorEmail = process.env.OPERATOR_EMAIL;
  return {
    async alert(alert) {
      const to = operatorEmail ?? process.env.EMAIL_FROM ?? "";
      if (to.length === 0) {
        console.error(
          `[crisis-operator] UNDELIVERED escalation ${alert.escalationId} (${alert.tenantId}): ${alert.reason}`,
        );
        return;
      }
      try {
        await sendMail(
          to,
          "plumb — a crisis alert could NOT be delivered to a counselor",
          `<p>An escalation could not reach a designated counselor and needs manual attention.</p>` +
            `<ul><li>Escalation: ${alert.escalationId}</li><li>School: ${alert.tenantId}</li>` +
            `<li>Reason: ${alert.reason}</li><li>Urgency: ${alert.urgency}</li></ul>` +
            `<p>Ensure a counselor is designated for this school and follow up directly.</p>`,
        );
      } catch (err) {
        // The operator channel must never throw — log loudly as the final backstop.
        console.error(
          `[crisis-operator] failed to alert operator for ${alert.escalationId}: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        );
      }
    },
  };
}
