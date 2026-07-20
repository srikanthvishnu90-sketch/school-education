# plumb overhaul — progress

Tracks the design/psychology/quality overhaul. Paired with `audit.md` (findings) and
the fix order **A → B → C → D → E → F → G**. Never delete a finding; move its status.

## Done

- **Phase 0 — audit** — `audit.md` written: 5 conflict-logged trust items (A), plus
  B–G, ~60 numbered findings, statuses assigned, fix sequence set.
- **A2 / C1 / CL-1** — Teacher class brief is aggregate-only. Removed the per-student
  emotional drill-down AND closed it at the query level (`buildClassBrief` returns a
  count, never `StudentInsightSummary[]`). Commit `59e439f`. `pnpm check` green
  (422 tests).
- **A1** — Teacher approval gate on AI-drafted questions. `ReflectionQuestionSet`
  now has `approvedAt`; AI can't self-approve; the student gate fails closed;
  teachers review + approve on the lesson page; board flags "Awaiting your review";
  seeds ship pre-approved. Domain + gate tests added. `pnpm check` + `pnpm build`
  green (426 tests). **P0 closed.**
- Prior production hardening (branch `feat/production-hardening`): B1–B6, A10, A11
  (partial), health endpoint, SAFETY_LIMITS.md, RUNBOOK.md.

## Next (in fix order)

1. **A3** — loop closure: `startReflection` opens session N+1 with the prior
   `selectedAction` ("Yesterday you chose X — what happened?"). **P0.**
3. **A4/A5** — forethought-recall opener + free-text-first emotion capture with an
   optional per-grade-band vocabulary assist (replace `emotion_select` primary). **P0.**
4. **A6/A7** — remove counselor/therapy voice from the safety surface; add the
   audience+safety disclosure banner to `CourseChat`. **P0.**

## Blocked / held (external)

- **B7** rls-audit CI + durable Postgres — held on `DATABASE_URL` (needs Neon or a
  Supabase re-auth as srikanthvishnu90@gmail.com; the two existing org projects are
  real Sporve production and must not be touched).
- **Phase 2 Sentry** — held on a Sentry DSN from your account.
- `RESEND_API_KEY` / `EMAIL_FROM` — held on your Resend account.
- Branch `feat/production-hardening` is intentionally **not** merged/deployed: the boot
  guard refuses a prod boot until the env vars are set (by design).
