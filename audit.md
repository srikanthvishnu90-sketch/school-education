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
- **A3** — *Loop closure absent (mandatory).* `startReflection` never revisited the
  prior session's `selectedAction`. **Status: fixed.** `ReflectionSession` carries a
  `carriedAction` (the prior reflection's chosen step); `startReflection` computes it
  from the student's most recent OTHER completed session; the deterministic engine
  opens by revisiting it ("Last time, you chose to try X. What happened when you tried
  it?") before any new question, shifting the rest by one offset. Engine + action-layer
  tests added.
- **A4** — *Session opened on the wrong beat.* The engine opened on a technical
  performance question. **Status: fixed.** The pool now opens on a **forethought-recall**
  beat ("Before this part of today's lesson…, what were you trying to get right?"),
  then performance, then self-reflection — Zimmerman's 3-beat order.
- **A5** — *Emotion capture was a closed word-select.* **Status: fixed** (and extended,
  per the user's follow-up). The emotion beat is now **free-text-first** with an OPTIONAL
  vocabulary assist (tap-to-start chips over a text box, never a picker). Going further:
  per the user's "all free response + evidence-based mastery" directive, the WHOLE set is
  now free-response except the single confidence rating (calibration's Brier/bias needs a
  number). The technical beat is a **retrieval-practice mastery probe** — the student
  re-derives and explains the actual skill (testing effect, 2.7) — and the set dissects
  both the MENTAL (forethought, feeling) and TECHNICAL (mastery, behavior) dimensions.
- **A6** — *Safety surface was voiced as a counselor / therapy tool.* "Thank you for
  sharing that. What you wrote sounds important." (ChatFlow SafetyTurn + CourseChat
  SafetyPanel). **Status: fixed.** Both now read "What you wrote looks serious, and it
  shouldn't wait for an app. A counselor at your school has been notified and can reach
  out to you. You're not in trouble for writing it." — factual, routes to a real human,
  no counseling performance. Test updated.
- **A7** — *Audience + safety disclosure at point of writing.* Present/correct in the
  reflection `ChatFlow` banner. `CourseChat` (a study-assistant surface, not the graded
  reflection) already carried a privacy+score+safety disclosure; tightened "a caring
  adult is told" → "a counselor at your school is notified" for precision and
  consistency. **Status: fixed** (adequate for that surface's audience).
- **A8** — *AI disclosure to the student.* **Status: fixed.** The reflection chat's
  disclosure banner now adds "These questions were drafted with AI and approved by your
  teacher before you saw them." — honest, at the point of writing (2.6, Part 1 #2).
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
- **C3** — `EraseButton.erase()` silent dead-end. **Status: fixed.** try/catch + `ok`
  check; a thrown action or `ok:false` now shows a `role="alert"` message (neutral ink
  tokens) that says nothing was removed and to try again.
- **C4** — `EscalationList.ack()` silent failure on the counselor surface.
  **Status: fixed.** try/catch + `ok` check; a failed acknowledgement now shows a
  `role="alert"` (warm accent, no red) — "that acknowledgement didn't save, the notice
  is still open" — and the row is only flipped on success.
- **C5** — `--font-voice` serif is referenced by `_ui/atoms.tsx:36` but never loaded
  (`layout.tsx:11-13`), so every `voice` surface silently falls back to browser serif —
  a half-wired feature. **Status: open.**
- **C6** — `reflections/page.tsx` is orphaned (no `href` anywhere) AND built on an
  older light-page template with no app shell, while every real signed-in surface
  renders `<Sidebar>` on the dark shell. It is functionally REDUNDANT with `/courses`
  (same reflections, same `/chat/{id}` destinations, same status labels). **Status:
  deferred (decision needed).** Deliberately NOT linked — dropping a student from the
  dark shell onto a light orphan is the exact rough edge the build standard forbids.
  It has a test (`test/app/ReflectionsPage.test.tsx`), so it is not pure dead code.
  **Resolved: rebuilt in the shell + linked** (per your decision). New reusable
  `_components/StudentShell` (the dark Sidebar frame lifted out of CoursesShell); the
  page now renders inside it with dark-shell tokens; `/reflections` ("Reflections") is
  a Sidebar nav item. Test kept green (mocks `signOutAction` for the shell). Note:
  `/timeline` is still a shell-less light page — a candidate for the same StudentShell.
- **C7** — `timeline/page.tsx` had no way back. **Status: fixed.** Added a "Back to
  courses" link (reusing the app's back-link pattern: 44px target, focus ring, ink
  tokens) at the top of the page.

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

- **E1** — Touch targets under 44px on nav/close/sign-out/send/photo-remove controls.
  **Status: fixed.** Every one bumped to ≥44px via `min-h-11 min-w-11` (icon-only chrome
  in Sidebar, TeacherShell, CoursesShell, CourseShell, LandingShell) or `h-11 w-11`
  (CourseChat send; NewLessonForm photo-remove restructured to a 44px transparent hit
  area around the small × glyph). Icon sizes and visual weight unchanged.
- **E2** — `RoleToggle` used an invalid ARIA tab pattern (tabs with no tabpanels).
  **Status: fixed.** It's a two-option mode selector, so it's now a `role="radiogroup"`
  with `role="radio"` + `aria-checked`, roving tabindex, and Arrow/Home/End key
  navigation. Visual pill unchanged.
- **E3** — `CourseShell` tabs. **Status: fixed.** Full APG tabs pattern: `aria-controls`
  tab→panel, panels get `id`/`role="tabpanel"`/`aria-labelledby`/`tabIndex={0}`, roving
  tabindex, and Arrow/Home/End navigation with selection-follows-focus. Hamburger → 44px.
- **E4** — `ConsentForm` age choices. **Status: fixed.** Now a `role="radiogroup"`
  (labelled by the legend) with `role="radio"` + `aria-checked` per option, roving
  tabindex, Arrow-key navigation, Space/Enter select. Selection is no longer color-only;
  submit/consent logic untouched.
- **E5** — `CourseChat` thread. **Status: fixed.** Now `role="log"` + `aria-live="polite"`
  + `aria-relevant` + `aria-busy` (mirrors ChatFlow), so replies and "thinking…" are
  announced.
- **E6** — `SignInList` pilot-code input. **Status: fixed.** Added
  `aria-label="Pilot access code"` (was placeholder-only).
- **E7** — `SignInList` status announcements. **Status: fixed.** The rejection error is
  `role="alert"`; the "check your inbox" confirmation is `role="status"` + `aria-live`;
  the Send button now shows "Sending…" while pending.
- **E8** — `ScoreEntry` invalid-score was color-only. **Status: fixed.** The input now
  carries `aria-invalid` + `aria-describedby`, and an out-of-range score shows a
  `role="alert"` message ("Enter a whole number from 0 to 100.") — meaning no longer
  depends on the warm border alone. Clears on edit.
- **E9** — `CourseChat` error is now `role="alert"` on a bordered surface (not color-only).
  **Status: fixed.**
- **E10** — `DeleteLessonButton`/`RosterForm` inline errors now carry `role="alert"`.
  **Status: fixed.**
- **E11** — `LoginForm`/`ConsentForm` errors no longer misuse `text-subject-math`.
  **Status: fixed.** Both now use the neutral bordered-alert treatment
  (`border-warm/50 bg-warm/5 text-ink-black`) — the warm accent as an attention surface,
  never a subject-tag color repurposed as red.
- **E12** — Data-URL `<img>` thumbnails now declare `width`/`height` (`NewLessonForm`
  80×80, `lessons/[reflectionId]/page.tsx` 400×400 square) for an explicit intrinsic
  ratio; both already sat in space-reserving containers. **Status: fixed.**

---

## F — COPY (warm-precise voice, Part 5)

- **F1** — SignInList therapy-speak slogan "A space for honest academic growth".
  **Status: fixed.** → "Read the lesson honestly, then choose one next step." — plain,
  task-focused, slogan treatment (uppercase-italic) dropped.
- **F2** — Safety "Thank you for sharing that…" **Status: fixed** (with A6).
- **F3** — CourseChat counseling opener "I'm here to think through … with you. How did
  today go?" **Status: fixed.** → "Hi {name} — let's work through {course}. Name one
  thing from today that clicked and one thing that felt tricky."
- **F4** — QuickActions SEL "Notice and name how the work actually went". **Status:
  fixed.** → "Review how today's work actually went."
- **F5** — Vague "Something went wrong." fallbacks. **Status: fixed** in all five
  (NewLessonForm, RosterForm, ConsentForm, LoginForm, CourseChat) — each now names what
  failed + what to do, keeping any specific server error (`result.error ?? …`).
- **F6** — Legal entity **"Plumb Reflection"** was absent everywhere. **Status: fixed.**
  Now in the footer copyright (SiteFooter + SignInList), and named as the operating
  entity in Privacy and Terms (`Plumb Reflection ("plumb", "we") operates plumb`). No
  legal facts fabricated — only the entity name. "plumb" stays lowercase as the product.
- **F7** — "Log in" vs "Sign in" drift. **Status: fixed.** LoginButton now says "Sign in".
- **F8** — Status→action label drift ("Review" vs "Review reflection") between CourseShell
  and reflections/page. **Status: open** (minor — pick one vocabulary).
- **F9** — Passive empty states. **Status: open** (low confidence; a counselor queue
  genuinely may have nothing to act on).
- **F10** — `login/page.tsx` had no `metadata`. **Status: fixed.** Added title +
  description + openGraph.
- **F11** — Public pages missing per-page `openGraph`. **Status: fixed** for
  privacy/terms/help/contact (each now has a matching openGraph).

### Unrouted marketing set (`_components/{Landing,GetStarted,HeroRotator,ScrollDrawHero,Reveal}.tsx`) — dead code
- **F12 / G2** — A self-contained marketing island: `Landing.tsx` has no importers and
  pulls in the other four; nothing routes to it (live landing is `_landing/LandingShell`).
  Its copy ("Try the cycle", "Get Started", lead-form voice) and two competing `<h1>`s
  would violate the voice rules if wired up, and it adds latent bundle weight. **Status:
  deferred (decision needed)** — it is DEAD but `HeroRotator` has a test
  (`test/app/HeroRotator.test.tsx`), so like `/reflections` it isn't pure dead code.
  **Your call:** delete the 5 components + the test, or keep it as a staging ground for a
  future marketing landing. Not deleted unilaterally.

---

## G — PERFORMANCE

- **G1** — Serverless timeout ceilings. **Status: reviewed / adequate.** The only route
  that makes a slow (vision analyze + generate) call is `lessons/page.tsx`, and it sets
  `maxDuration = 30`. Ingest is deterministic parsing (no model/vision call) and the chat
  route runs the deterministic engine by default, so neither needs an extended ceiling.
- **G2** — Unrouted marketing set adds latent bundle weight if ever imported. **Status:
  deferred** — tied to the F12 decision (delete vs keep as a staging ground).
- **G3** — Data-URL images without dimensions (CLS). **Status: fixed** (see E12 — explicit
  `width`/`height` on both thumbnail sites; both already in space-reserving containers).

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
