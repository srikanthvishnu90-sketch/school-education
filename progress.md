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

- **A3/A4/A5** — Reflection-engine rework. `ReflectionSession.carriedAction` + loop
  closure (revisit the prior chosen step first); forethought-recall opener; the whole
  set is now FREE-RESPONSE (only the confidence rating stays, for calibration) with a
  retrieval-practice **mastery probe** (student re-derives + explains the skill) and a
  free-text emotion beat with optional vocabulary chips. Dissects mental + technical.
  Engine, action-layer, and UI (vocab chips) updated; +6 tests; `pnpm check` green
  (432 tests). Note: kept the ONE numeric confidence bet — calibration is plumb's core;
  told the user, they can ask to drop it. **P0s closed.**
- **A6/A7** — De-therapized crisis voice; tightened CourseChat disclosure.

## Next (in fix order)

1. **LLM generate contract** — align `CATEGORY_SEQUENCE` + format gates + `VALID_QUESTIONS`
   fixture to the new free-response/mastery design (llm generate is off by default and
   falls back to the correct deterministic engine, so this is a consistency follow-on).
2. **A8/A9** — AI disclosure to students; per-grade-band copy.
3. Legacy: **A3** — loop closure: `startReflection` opens session N+1 with the prior
   `selectedAction` ("Yesterday you chose X — what happened?"). **P0.**
3. **A4/A5** — forethought-recall opener + free-text-first emotion capture with an
   optional per-grade-band vocabulary assist (replace `emotion_select` primary). **P0.**
4. **A6/A7** — remove counselor/therapy voice from the safety surface; add the
   audience+safety disclosure banner to `CourseChat`. **P0.**

## Design + functionality overhaul (identity → 9/10)

- **Identity unified (foundation):** the dark shell is now DEEP INK NAVY (same ink DNA
  as the light surfaces), not ChatGPT gray; the accent is PLUMB BRASS (#BD9052), not
  green. One coherent identity, two modes. `shell-sage` fully renamed to `shell-accent`.
  WCAG AA contrast verified across the whole navy palette (all text ≥4.5:1).
- **Real typography:** Fraunces display serif loaded + applied to display headings and
  a distinctive `plumb` **wordmark** (brass plumb-bob hanging from the "b"). Inter stays
  for data/body.
- **Identity motif:** the product's namesake made visible — a `PlumbLine` component
  (cord + brass bob "settling to true") + `graph-paper` / `graph-paper-dark` grids
  across surfaces; ONE signature motion moment (the plumb line settles to true vertical),
  reduced-motion safe, on the landing hero and the reflection summary.
- **Honest landing:** the fake ChatGPT composer (a disabled input dressed as interactive)
  is gone — replaced with an honest brass "Sign in to start" door + editorial hero.
- **Reflection chat + student home** refined to premium craft, all a11y preserved.
- **Functionality — exemplar + feedback:** the retrieval-practice mastery probe now
  closes against a teacher's WORKED EXAMPLE (attempt from memory → compare to the
  correct answer) — real feedback that teaches (Kluger & DeNisi), not text-collection.
- **Functionality — grade bands:** a lesson can be tagged K-2 / 3-5 / 6-8 / 9-12; the
  engine phrases the same questions age-appropriately (plainer for younger). No longer
  one-size-fits-all.
- All shipped via specialized agents on disjoint files, integrated + verified centrally
  (`pnpm check` 435 tests + `pnpm build` green).

## Blocked / held (external)

- **B7** rls-audit CI + durable Postgres — held on `DATABASE_URL` (needs Neon or a
  Supabase re-auth as srikanthvishnu90@gmail.com; the two existing org projects are
  real Sporve production and must not be touched).
- **Phase 2 Sentry** — held on a Sentry DSN from your account.
- `RESEND_API_KEY` / `EMAIL_FROM` — held on your Resend account.
- Branch `feat/production-hardening` is intentionally **not** merged/deployed: the boot
  guard refuses a prod boot until the env vars are set (by design).
