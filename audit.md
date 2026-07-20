# plumb — full audit (design · psychology · quality)

Phase 0 artifact for the overhaul. Findings are numbered and never deleted; each
carries a **status**: `open` · `fixed` · `deferred` · `rejected`. Fix order is
strictly **A → B → C → D → E → F → G**. Where an instruction conflicts with
existing code intent, **Part 1 wins** and the conflict is logged in §A.

Legend for confidence: P0 = ships-broken-trust, must fix before anything else.

---

## Conflict log (Part 1 overrides existing code intent)

- **CL-1** — The class-brief page rendered per-student emotional/technical/behavioral
  summaries ("Each student's reflection"). Existing code intent: give the teacher
  rich per-student insight. Part 1 #1 (aggregate only, full stop) and Part 3 (no
  per-student emotional drill-down anywhere) override it. Resolved: section removed
  **and** `buildClassBrief` now returns only a count (query-level, per C.13).
  → see A2. **Status: fixed** (commit `59e439f`).

---

## A — TRUST (the five non-negotiable principles). All P0.

- **A1** — *No human gate on AI→people path.* `createLessonReflection` saved
  AI-drafted questions directly, reaching students with no teacher approval.
  Violated Part 1 #2 / Part 3. **Status: fixed.** `ReflectionQuestionSet` now carries
  `approvedAt: Date | null` (a domain invariant); AI adapters draft with `approvedAt:
  null` and can't self-approve; the student gate in `reflectionActions` fails closed
  on an unapproved set ("not available"); teachers review + `approveReflectionQuestions`
  on the lesson page ("Review before students see it"); the board shows "Awaiting your
  review"; seeded demo content ships pre-approved. Tests: domain approval + idempotence,
  student gate refusal. `pnpm check` + `pnpm build` green.
- **A2** — *Teacher per-student emotional drill-down.* Class-brief page exposed each
  named student's emotional summary. Violates Part 1 #1 / Part 3. **Status: fixed** (`59e439f`).
- **A3** — *Loop closure absent (mandatory).* `startReflection`
  (`src/app/_world/reflectionActions.ts`) never revisits the prior session's
  `selectedAction`. Zimmerman's cycle (2.1) requires session N+1 to open with
  "Yesterday you chose X — what happened?". **P0. Status: open.**
- **A4** — *Session opens on the wrong beat.* `deterministic.generate()`
  (`src/adapters/intelligence/deterministic.ts` ~L441) opens with a **technical
  performance-review** question, not a **forethought-recall** beat. Violates the
  3-beat order in 2.1 (forethought → performance → self-reflection). **P0. Status: open.**
- **A5** — *Emotion capture is a closed word-select, not free-text-first.* Q2 uses
  `format: "emotion_select"` with fixed word options. Barrett granularity (2.4)
  requires **free-text-first**, with an *optional* per-grade-band vocabulary assist —
  never a closed picker as the primary. (Better than the banned 5-emoji picker, but
  still non-compliant.) **P0. Status: open.**
- **A6** — *Safety surface is voiced as a counselor / therapy tool.* "Thank you for
  sharing that. What you wrote sounds important." in `ChatFlow.tsx:472` (SafetyTurn)
  and duplicated in `CourseChat.tsx:150` (SafetyPanel). Violates Part 1 #5 (NEVER
  styled/voiced as a mental-health tool) and the warm-precise voice rule. **P0. Status: open.**
- **A7** — *Audience + safety disclosure at point of writing.* Present and correct in
  the reflection `ChatFlow` banner ("Teachers see a summary, not this chat. Safety
  concerns create a counselor alert."). **MISSING** in the parallel `CourseChat`
  surface (`src/app/courses/[courseId]/CourseChat.tsx`) — a student writing there gets
  no audience disclosure. Violates Part 2 (2.6.1). **P0. Status: open.**
- **A8** — *AI disclosure to the student.* No surface tells the student that the
  questions were AI-drafted / that a person approved them (2.6, Part 1 #2 spirit).
  **Status: open.**
- **A9** — *Per-grade-band copy does not exist.* One copy register for all grades;
  2.6 requires banded phrasing. **Status: open** (F-tier work, but the *mechanism*
  is a trust item — a 3rd grader and an 11th grader must not read the same prompt).
- **A10** — *Deterministic safety-escalation policy.* Verified sound: `detectCrisis`
  is deterministic, the LLM never decides safety, escalation routes by real tenant,
  fails to operator fallback, never silently drops. **Status: fixed** (prior hardening).
- **A11** — *Private-by-default with one honest exception.* Escalation text is sealed
  (encrypted) at rest; counselor sees who/tier/when, never the raw text; the exception
  is restated in-product (A7 banner) at the reflection surface. Partial — see A7 gap.
  **Status: partial.**

---

## B — SECURITY

- **B1** — Production boot guard refuses to start without required config
  (`instrumentation.ts` + `assertProductionConfig`). **Status: fixed** (prior hardening).
- **B2** — Crisis retry cron requires `CRON_SECRET` in production; endpoint refuses
  to run unprotected (`api/safety/retry/route.ts`). **Status: fixed.**
- **B3** — Unconfigured email fails loud in production instead of silently
  "delivering" (`safetyChannels.ts`). **Status: fixed.**
- **B4** — Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) set in `next.config.ts`. **Status: fixed.**
- **B5** — Demo personas gated behind `SHOW_DEMO_PERSONAS`; demo crisis protocol is
  dev/test only; no hardcoded `CRISIS_TENANT`. **Status: fixed.**
- **B6** — Cross-tenant isolation: counselor reads `listByTenant(user.tenantId)`;
  screening routes by the student's own tenant. Covered by tests. **Status: fixed.**
- **B7** — *RLS parity is asserted only in Postgres adapter code, not in CI.* No
  `rls-audit` script proves every table has a policy. **Status: open** (deferred: no
  live DB provisioned yet — held on DATABASE_URL).
- **B8** — `.env.local` must never be committed; confirm `.gitignore` covers it and
  no secret is checked in. **Status: open** (verify).

---

## C — CORRECTNESS

- **C1** — `buildClassBrief` query-level leak of per-student emotional text closed
  (returns count only). **Status: fixed** (`59e439f`).
- **C2** — Zero-LLM path must produce a valid, schema-conformant session end to end
  (deterministic default). Confirmed by tests. **Status: fixed.**
- **C3** — `EraseButton.erase()` (`src/app/timeline/EraseButton.tsx:17-31`) runs in
  `startTransition` with no `try/catch` and only handles `ok===true`; a thrown action
  or `ok:false` is a silent dead-end. **Status: open.**
- **C4** — `EscalationList.ack()` (`src/app/escalations/EscalationList.tsx:22-29`) has
  no error handling; a rejected `acknowledgeEscalation` leaves the row stale with no
  feedback — on the *counselor* surface, where silent failure is worst. **Status: open.**
- **C5** — `--font-voice` serif is referenced by `_ui/atoms.tsx:36` but never loaded
  (`layout.tsx:11-13`), so every `voice` surface silently falls back to browser serif —
  a half-wired feature. **Status: open.**
- **C6** — `reflections/page.tsx` route exists but is not linked from `Sidebar`
  (`_landing/Sidebar.tsx:31-34`) — orphaned/unreachable via UI. **Status: open.**
- **C7** — `timeline/page.tsx` renders with no shell and no back-link to `/courses`;
  a student who lands there is stranded. **Status: open.**

---

## D — UI / UX

- **D1** — Hero "composer" (`_landing/HeroInput.tsx:20-29`) looks like a working chat
  input but is `disabled`/`aria-hidden`; the send control is a `<span>`. Fakes
  interactivity on the landing. **Status: open.**
- **D2** — `CoursesShell` (`src/app/courses/CoursesShell.tsx:74-116`) has no empty
  state; an empty roster renders a blank screen under the greeting. **Status: open.**
- **D3** — No custom `not-found.tsx`; `notFound()` is called in two routes but users
  hit the bare Next.js 404. **Status: open.**
- **D4** — No route-level `error.tsx` outside `chat/`; a throw in `courses`, `lessons`,
  `admin`, `escalations`, `roster`, `ingest`, `timeline` shows the default overlay.
  **Status: open.**
- **D5** — No `loading.tsx` outside `chat/`; the `lessons/[reflectionId]` teacher brief
  makes a 30s vision call with no route loading UI. **Status: open.**
- **D6** — No `@media print` and no print button; the class brief (the screen most
  likely to be printed) prints with nav rails and search bar. **Status: open.**
- **D7** — Save/submit buttons lack a pending label ("Saving…"): `ScoreEntry.tsx:80-87`,
  `SignInList.tsx` "Send link" (224-231). Only opacity changes. **Status: open.**
- **D8** — Lesson board photos render `grid-cols-3` at mobile with no lightbox; attached
  evidence is illegible on a phone (`lessons/[reflectionId]/page.tsx:96-108`). **Status: open.**
- **D9** — `IngestForm` report/error (`src/app/ingest/IngestForm.tsx:47-83`) renders with
  no `aria-live`. **Status: open.**
- **D10** — Error-display convention is inconsistent: some forms use `role="alert"`
  bordered panels (ChatFlow/LoginForm/ConsentForm), others use plain text / border-only /
  nothing (CourseChat/DeleteLessonButton/RosterForm/IngestForm/ScoreEntry). One
  convention needed. **Status: open.**
- **D11** — Dead lead-capture form `GetStarted.tsx` fakes success with no submission
  (unrouted marketing set). **Status: deferred** (delete dead `_components/*` set).

---

## E — ACCESSIBILITY (WCAG AA)

- **E1** — Touch targets under 44px on primary actions: `CourseChat` send `h-8 w-8`
  (32px, L119-127); `NewLessonForm` photo-remove `h-5 w-5` (20px, L164-171); landing
  hamburger ~36px; `Sidebar` close ~24px / sign-out ~28px; `TeacherShell` close/menu/
  sign-out all ~24-30px; `CoursesShell`/`CourseShell` hamburger ~34px. **Status: open.**
- **E2** — `RoleToggle.tsx:31-60` uses `role="tablist"`/`tab`/`aria-selected` with **no**
  tabpanels, no `aria-controls`, no arrow-key roving — invalid ARIA tab pattern; it's a
  toggle. **Status: open.**
- **E3** — `CourseShell.tsx` tabs (90-206) have no `aria-controls`, tabpanels lack
  `id`/`aria-labelledby`, no roving `tabIndex`, panels not focusable. **Status: open.**
- **E4** — `ConsentForm.tsx:100-127` age choices sit in a `<fieldset>/<legend>` implying
  a radio group but are plain `<button>`s with no `role="radio"`/`aria-checked`;
  selection is color + a filled dot only. **Status: open.**
- **E5** — `CourseChat` thread (71-97) has no `role="log"`/`aria-live`; assistant replies
  and the "thinking…" state are never announced (ChatFlow does this right). **Status: open.**
- **E6** — `SignInList.tsx:233-244` "Pilot access code" input has no `<label>`/`aria-label`
  — placeholder only, `aria-invalid` toggled with no accessible name. **Status: open.**
- **E7** — `SignInList.tsx:245-250` `codeRejected` error and 188-206 "check your inbox"
  confirmation have no `role="alert"`/`aria-live`. **Status: open.**
- **E8** — `ScoreEntry.tsx:67-78` invalid-score feedback is border color only
  (`border-warm`), no text, no `aria-invalid` — meaning is purely color. **Status: open.**
- **E9** — `CourseChat.tsx:99-102` error is plain text, same color as body, no
  `role="alert"`. **Status: open.**
- **E10** — `DeleteLessonButton`/`RosterForm` inline errors have no `role="alert"`; roster
  relies on warm border for "error" meaning. **Status: open.**
- **E11** — `LoginForm`/`ConsentForm` errors use `text-subject-math` (a subject-tag color)
  as the error color — semantic token misuse. **Status: open.**
- **E12** — Data-URL `<img>` thumbnails have no width/height (`NewLessonForm`,
  `lessons/[reflectionId]/page.tsx`), risking layout shift. **Status: open.**

---

## F — COPY (warm-precise voice, Part 5)

- **F1** — `SignInList.tsx:288` "A space for honest academic growth" — therapy-speak
  ("a space for…") + performative-growth framing, set as an italic-uppercase slogan.
  **Status: open.**
- **F2** — Safety copy "Thank you for sharing that…" (ChatFlow:472, CourseChat:150) —
  counseling voice. (Same string as A6; fix once.) **Status: open.**
- **F3** — `CourseChat.tsx:32` opener "I'm here to think through … with you. How did
  today go?" — check-in/counseling register, not task-focused. **Status: open.**
- **F4** — `_landing/QuickActions.tsx:20` "Notice and name how the work actually went" —
  SEL/mindfulness register. **Status: open.**
- **F5** — Vague error fallback "Something went wrong." in `ChatFlow`(via CourseChat:64),
  `NewLessonForm:99`, `RosterForm:26`, `ConsentForm:28`, `LoginForm:48` — states neither
  what happened nor what to do. **Status: open.**
- **F6** — Legal entity **"Plumb Reflection"** appears nowhere. Footer wordmark +
  copyright (`SiteFooter.tsx:34,43`; `SignInList.tsx:299,318`), Privacy
  (`privacy/page.tsx:6,15`), Terms (`terms/page.tsx:13,19`) all use the product name
  where the legal entity is required. **Status: open.**
- **F7** — Action-name drift: landing says "Log in" (`LoginButton.tsx:19`) but the
  destination and all legal headers say "Sign in". **Status: open.**
- **F8** — Status→action labels diverge between `CourseShell.tsx:23-29` ("Review"/"Open")
  and `reflections/page.tsx:27-33` ("Review reflection"/"Open reflection") for identical
  statuses. **Status: open.**
- **F9** — Passive empty states with no next action: `EscalationList.tsx:35` "Nothing to
  look at right now."; `reflections/page.tsx:78-83`. **Status: open** (low confidence —
  counselor queue genuinely may have nothing).
- **F10** — `login/page.tsx` exports no `metadata` — falls back to the generic root title,
  no page-specific description/OG. **Status: open.**
- **F11** — Public pages (privacy/terms/help/contact) set title+description but no
  per-page `openGraph`, so OG inherits the generic root. **Status: open.**

### Unrouted marketing set (`_components/{Landing,GetStarted,HeroRotator,ScrollDrawHero,Reveal}.tsx`) — dead code
- **F12** — "Read how plumb closes the calibration gap" under a "New" badge; "Try the
  cycle"; "Get Started" generic CTAs; "Interested in bringing accurate self-knowledge
  to your learners?" lead-form voice. Two competing `<h1>`s on one page. **Status:
  deferred** — recommend deleting the whole unrouted set rather than fixing copy on dead code.

---

## G — PERFORMANCE

- **G1** — `lessons/page.tsx` sets `maxDuration = 30` for the vision call; other routes
  making awaited calls should be reviewed for Hobby/Pro timeout ceilings. **Status: open.**
- **G2** — Unrouted marketing set (HeroRotator video autoplay, ScrollDraw 300vh scroll
  listener, IntersectionObserver) would add bundle weight if ever imported; deleting it
  removes the risk. **Status: deferred** (same delete as F12).
- **G3** — Data-URL images without dimensions cause layout shift (CLS) — see E12.
  **Status: open.**

---

## Positives confirmed (do not re-flag)

- `ChatFlow.tsx` is the reference surface: `role="log"`+`aria-live`, 44px targets,
  `focus-visible` rings, `env(safe-area-inset-*)`, reduced-motion, skip link.
- Favicon and OG image present. No exclamation/emoji in system copy. No person-level
  praise or ability-verdict language in user copy (only in *detectors* that forbid it).
- "journey" appears once, in a code comment — not user-facing.
- Crisis pipeline: deterministic detection, sealed text, tenant-scoped routing,
  operator fallback, escalating retry — verified.

---

## Fix sequence (A → G)

1. **A1** teacher approval gate (server-enforced "Review questions" step).
2. **A3** loop closure (revisit yesterday's chosen step).
3. **A4/A5** forethought-recall opener + free-text-first emotion with grade-band assist.
4. **A6/A7** de-therapize + de-duplicate the safety voice; add CourseChat audience banner.
5. **B7/B8** rls-audit CI + secret hygiene (B7 deferred to DB provisioning).
6. **C3–C7** error handling + orphaned routes.
7. **D → E → F → G** as listed.
