# plumb — Operator Runbook

_For a non-technical operator. When something alerts, find it here: what it means,
what to do first as a human, and the exact prompt to paste into Claude Code to fix it._

> **Rule for anything crisis-related: a human acts first, the software second.** If an
> alert suggests a student may be in danger, follow your school's crisis protocol and
> contact the designated counselor **now**. Diagnosing the software comes after.

---

## Alerts

### 1. Operator crisis email — "a crisis alert could NOT be delivered to a counselor"
**Means:** a student triggered a crisis escalation but it could not reach a designated
counselor (none configured for that school, or the notification email failed).
**Do first (human):** treat it as a live safety event. Identify the school from the
email, reach that school's counselor/administrator directly by phone, and follow your
crisis protocol. Do not wait for the software.
**Then (fix):** paste into Claude Code:
> "An operator crisis fallback fired for tenant `<tenant>`. Check `/api/health`
> crisisPipeline status, confirm RESEND_API_KEY/EMAIL_FROM/OPERATOR_EMAIL are set on
> Vercel, and confirm a counselor contact is configured for that tenant. Here's the
> email: <paste>."

### 2. Undelivered-escalation flag in the counselor console
**Means:** an escalation is persisted but not yet delivered/acknowledged; the retry job
keeps re-attempting it every 10 minutes.
**Do first (human):** open the counselor console (`/escalations`), find the flagged
student, and follow protocol — don't rely on the retry.
**Then (fix):** paste into Claude Code:
> "An escalation shows undelivered in the counselor console and isn't clearing. Check
> `/api/health`, the Vercel logs for `/api/safety/retry`, and whether email delivery
> is failing. Diagnose why retry isn't delivering."

### 3. Uptime down (UptimeRobot on `/api/health`)
**Means:** the site or a dependency is failing — the health check returned non-200 or
the `crisisPipeline` keyword stopped reading "healthy".
**Do first (human):** open `https://<your-domain>/api/health` in a browser and read
which check is failing (`database`, `email`, `anthropic`, or `config`).
**Then (fix):** paste into Claude Code:
> "`/api/health` is degraded. Here's the JSON: <paste>. Diagnose and fix the failing
> dependency. If `config.missing` is non-empty, tell me exactly which Vercel env vars
> to set."

### 4. Sentry crisis-pipeline event  _(pending — enabled in Phase 2)_
**Means (once enabled):** an error occurred on the crisis path (screening, delivery,
retry). Highest priority.
**Do first (human):** assume a notification may have failed; follow crisis protocol for
any student named in the last hour, and verify the counselor console.
**Then (fix):** paste the Sentry issue link into Claude Code and ask it to diagnose.

### 5. Sentry general error  _(pending — enabled in Phase 2)_
**Means (once enabled):** a server action or the model gateway failed in production.
**Do first (human):** note whether users are blocked (uptime + a quick click-through).
**Then (fix):** paste the Sentry issue link into Claude Code and ask it to diagnose.

---

## Deploy checklist

plumb **refuses to start in production** unless every one of these is set on Vercel
(this is intentional — a crisis screener must not run on missing keys):

- `SESSION_SECRET` — random 32+ chars
- `DATABASE_URL` — durable Postgres (Neon or Supabase transaction-pooler URL)
- `CRISIS_KEY_HEX` — 64 hex chars, **not** all zeros (`openssl rand -hex 32`)
- `REFLECTION_KEY_HEX` — 64 hex chars (`openssl rand -hex 32`)
- `RESEND_API_KEY` + `EMAIL_FROM` — real email delivery
- `OPERATOR_EMAIL` — where the crisis fallback goes (your monitored inbox)
- `CRON_SECRET` — random 24+ chars (protects the retry cron)

Optional: `ANTHROPIC_API_KEY` (AI drafting; deterministic engine runs without it),
`CONTACT_EMAIL` (a real address on the Contact page), `NEXT_PUBLIC_SITE_URL`,
`SHOW_DEMO_PERSONAS=1` (demo only — never on a real school deployment).

**After every deploy:** open `https://<your-domain>/api/health` and confirm
`"status": "ok"` and `"crisisPipeline": "healthy"`. If it's `degraded`, read
`checks` to see which dependency or config is the problem, and use Alert #3 above.
