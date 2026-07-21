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
