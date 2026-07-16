# plumb software analysis

Audit date: 2026-07-11  
Audited code: base revision `33852ce` plus the current, uncommitted working tree  
Deployment reviewed: `awareness-2fohj2wen-srikanthvishnu90-sketchs-projects.vercel.app`

## Executive verdict

The student reflection experience is now coherent and testable. The dark chat works, teacher-created lessons reach the correct seeded students, conversations resume, optional questions can be skipped, uncertainty is respected, model-generated wording is policy-checked, safety text creates a counselor-queue record, and the current browser flow closes from student to counselor.

The software is still **not ready for a real student pilot**. The remaining blockers are architectural trust boundaries, not chat styling:

1. identity is a caller-selected raw cookie, so student, teacher, and counselor roles are forgeable;
2. the primary lesson/chat/summary data is process-memory-only and incompatible with reliable serverless deployment;
3. the safety queue has no real human-delivery channel, durable retry worker, or required production key;
4. the optional database/RLS design trusts self-asserted claims and cannot protect evidence integrity.

The attached article also changes the product standard: reflection must be student-owned practice, not a measurement shortcut. The new prompts follow that standard substantially better, but teacher attention groups still turn self-report alone into named consequences. That is the largest unresolved product-design problem.

## Verification snapshot

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm check` | Pass | TypeScript, ESLint, 45 test files and 291 tests passed; 5 files / 44 database-dependent tests skipped |
| `pnpm e2e` | Pass | 3/3 Chromium flows: magic-link sign-in, lesson inbox, crisis chat, counselor visibility and acknowledgement |
| `pnpm build` | Pass with network | Next 16.2.9 production build completed; static generation dropped from 47 seconds to 239 ms after sign-in stopped initializing the AI world |
| `pnpm audit --prod` | Pass | No known vulnerabilities after pinning PostCSS 8.5.16 |
| `git diff --check` | Pass | No whitespace errors |
| Responsive inspection | Pass | Student inbox inspected at 1280×900 and 390×844; chat exercised in desktop Chromium |

The build still downloads Inter from Google through `next/font/google`; it fails in an offline or restricted network.

## What was completed in this update

### Chat and student flow

- Added a near-black chat theme with light text, semantic chat tokens, native dark controls, safe-area handling, visible focus, reduced motion, and 44 px minimum targets.
- Added a student lesson inbox at `/reflections`; teacher-created lesson IDs now link to their matching `/chat/[reflectionId]` route.
- Limited the inbox to seeded roster members. Self-signup accounts no longer receive the hard-coded class feed.
- Required a student session for the route and every mutation.
- Enforced session ownership, active/completed state, selected-action membership, and 4,000/500-character message/action limits.
- Restored active transcripts, completed summaries, selected actions, and escalated safety state without duplicate questions.
- Implemented real multi-select behavior, closed-question-only choices, optional skip, honest uncertainty, IME-safe Enter handling, failure rollback, retry copy, focus recovery, and near-bottom-aware scrolling.
- Added route loading and error states, an all-lessons exit, and actionable `tel:988` / `sms:988` controls.

### Question and measurement design

- Questions now derive from the teacher’s recent lesson activity and objective rather than a generic topic template.
- Standard order is: concrete episode → emotion at that moment → last explainable step → observed next action → score prediction.
- The prediction now asks how much of the **same reflected work** the student expects was correct before seeing the score or answer key. The later teacher-entered score is therefore the matching outcome.
- Closed formats include `I'm not sure`; typed `idk`, `I don't know`, `no idea`, and `I'm not sure yet` are also accepted without repeated probing.
- Optional skips and uncertainty are excluded from signal extraction, evidence, model input, and verbosity-based confidence.
- Deterministic and LLM-generated prompts reject trait language, leading assumptions, yes/no framing, construct switching, missing lesson context, malformed scales, and missing predictions.
- Model rephrasing, model signal extraction, and model student summaries are disabled by default. With an Anthropic key, only teacher lesson analysis and validated question drafting are model-assisted.
- Recommended actions are now student-controlled choices rather than instructions written for a teacher.
- Individual and class relationship summaries now report same-episode/same-student co-occurrence rather than inventing causal or cross-student relationships.

### Release gates

- Rewrote the stale Playwright suite around the current product.
- Made browser tests deterministic by disabling optional model, database, and email integrations.
- Added focused regression tests for ownership, resume, crisis routing, history, formats, skip, uncertainty, prompt attacks, summary actions, inbox enrollment, and failure recovery.
- Removed sign-in’s dependency on full world initialization, eliminating accidental model calls during static builds.
- Cleared the PostCSS advisory with a workspace-level override.

## What works well

1. **The domain boundary is disciplined.** Ports/adapters are explicit, strict TypeScript is enabled, Zod schemas guard runtime inputs, and domain purity is mechanically tested.

2. **The zero-key product is real.** Lesson analysis, question generation, conversation flow, signal extraction, student summaries, and class summaries all work without an external model.

3. **Model output is contained.** Generated question sets are accepted atomically only after schema, category, wording, task-anchor, uncertainty, and prediction checks. Rejected output falls back to deterministic generation.

4. **Chat action authorization is now meaningful.** A signed-in student cannot mutate another signed-in student’s session merely by changing the session ID. This remains dependent on replacing the forgeable global identity mechanism.

5. **Safety capture now reaches the application boundary.** A crisis phrase creates a sealed escalation record, leaves the chat terminal, survives a page refresh within the same backing store, appears to the counselor, and can be acknowledged.

6. **The UI is accessible and restrained.** It avoids reward mechanics, red/green semantics, gradients, glass effects, decorative motion, and misleading “just between us” language.

7. **The test surface now reflects the product.** Unit, action, component, prompt-policy, and end-to-end tests cover the actual lesson-inbox-chat-counselor path.

## Article-driven measurement analysis

| Principle from the supplied article | Current status | Assessment |
| --- | --- | --- |
| Ask about a concrete recent episode | Implemented | Teacher activity/objective appears in deterministic and accepted model prompts |
| Avoid trait, leading, and yes/no questions | Implemented at generation boundary | Deterministic wording and model validation have adversarial tests |
| Make uncertainty and declining valid | Implemented | Closed option, typed variants, optional skip, no follow-up pressure |
| Do not interpret a pass as evidence | Implemented | Passes are filtered from signals, evidence, model input, and confidence |
| Join prediction to its exact outcome | Mechanically implemented | Prediction concerns the reflected work; score is entered only after completion |
| Adapt format to verified age/grade | Missing | No trusted age/grade reaches lesson creation or question generation |
| Keep observed evidence primary | Violated | Class attention groups are still generated from reflection signals alone |
| Do not let self-report directly create consequences | Violated | Named students and a teacher plan are produced without matched performance evidence |
| Let the student correct an interpretation | Missing | Summary is displayed, but there is no correction/confirmation transition |
| Branch when the episode does not apply | Missing | “I did not reach this part” still advances to questions that assume the episode exists |

The key conclusion is uncomfortable but important: better questions improve dignity and usefulness; they do not make child self-report a ground-truth measurement. plumb should use reflection to help students notice and explain, then use same-task evidence to decide what adults do.

## P0 — release blockers

### P0-1. Identity and staff roles are forgeable

**Evidence**

- `src/app/signin/page.tsx` publishes seeded student, teacher, and counselor identities.
- `src/app/signin/SignInList.tsx` sends the selected ID to a public server action.
- `src/app/_world/session.ts` writes the caller-supplied ID directly into `plumb_session`.
- Role is derived only by comparing that raw cookie value with fixed IDs.
- The cookie is HTTP-only and SameSite=Lax, but it is unsigned and has no `secure`, expiry, rotation, revocation, or server-side session lookup.

**Impact**

Anyone who can invoke the action or forge the cookie can become a student, teacher, or counselor. Chat ownership checks then trust the forged identity. A forged counselor can view and acknowledge a crisis, stopping retry behavior.

**Required fix**

Use district/OIDC or verified magic-link identity to mint an opaque, expiring server-side session. Disable elevated demo identities in production. Authorize role, tenant, class membership, lesson ownership, and escalation tenancy from trusted session records on every action.

### P0-2. The primary product is not persistent

**Evidence**

- `buildIntelRepos()` always returns Map-backed repositories.
- Lessons, question sets, chat sessions, summaries, class briefs, and reflection scores remain in process memory even when `DATABASE_URL` exists.
- Lesson photos use another process-local Map.
- `.env.example` now documents this limitation accurately.

**Impact**

Cold starts erase the primary workflow. Concurrent Vercel instances can disagree about which lessons, messages, summaries, scores, and escalations exist. A teacher can create a lesson on one instance that a student cannot see on another.

**Required fix**

Implement Postgres repositories for every intelligence entity, object storage for photos, real migrations, transactions, repository contract tests, and version/idempotency fields. Do not treat Vercel deployment as live-product persistence until this is complete.

### P0-3. Safety records are not real human notification

**Evidence**

- Chat now invokes `screenReflectionText` and creates a crisis escalation.
- Delivery and operator adapters in `safetyWorld.ts` are recording-only memory channels.
- Recording is marked as delivered even though no email, SMS, pager, staffed console event, or district protocol integration occurred.
- `retryPending` has no production scheduler.
- Without Postgres, the queue is process-local.
- `CRISIS_KEY_HEX` silently falls back to a public all-zero development key.
- Tenant and counselor routing are hard-coded.

**Impact**

The in-app counselor flow passes in one process, but no real person is guaranteed to learn about the event. Serverless instance boundaries or restarts can lose the record.

**Required fix**

Require a production key/KMS and tenant protocol at startup, persist before response, deliver through a monitored real channel, run durable retries, verify tenant on acknowledgement, expose delivery health, and test exactly-once escalation across process restarts.

### P0-4. The optional RLS design is bypassable

**Evidence**

- `src/adapters/supabase/rls.ts` creates a login with a known password.
- `authClient.ts` permits arbitrary subject, role, and tenant claims.
- runtime repositories use the service connection rather than a request-scoped trusted identity;
- broad student `FOR ALL` policies cover evidence/outcome/privacy tables;
- multiple keys and queries omit tenant identity.

**Impact**

The database cannot serve as the evidence boundary: a caller can self-assert identity or write data that later appears to be observed truth.

**Required fix**

Use trusted external claims, non-login application roles, request-scoped transactions, forced RLS, least privilege, tenant-qualified keys, and hostile multi-tenant integration tests for every table.

## P1 — major product, privacy, and correctness issues

### P1-1. Self-report still creates named teacher consequences

`attentionGroupFor()` derives apparent understanding/confidence/help-avoidance groups only from student-answer keywords. The lesson page renders named labels such as “Struggling and knows it” and “Confident past the evidence,” then presents a teacher plan. `ClassStudentInput` contains no matched performance evidence.

Remove self-report-only named groups. Reflection may explain a discrepancy or open a private conversation; a teacher action should require objective evidence from the same student, task, and time window.

### P1-2. Consent, privacy, export, and deletion do not cover chat intelligence

Chat capture checks no consent scope. Seeded users receive synthetic parent consent; self-signups can authenticate without a durable consent record. Revocation deletes legacy affect rows, not sessions, summaries, scores, photos, external-model payloads, or derived teacher groups. Existing global disclosure language understates teacher access.

Define a lawful basis and consent policy for every flow; enforce it at capture/provider boundaries; implement export, correction, retention, and cascading deletion; and make the student-facing disclosure match the DTOs teachers actually receive.

### P1-3. There is no verified age/grade contract

The live flow uses one five-point scale and emotion vocabulary for every student. Lesson creation does not capture a trusted grade band, and generation does not receive one in the normal teacher path.

Keep the product explicitly adolescent-only until response formats, vocabulary, readability, authority effects, and repeated-prompt fatigue are validated per age band.

### P1-4. Conversation flow is sequential, not meaningfully adaptive

The primary next question is selected by answer count. A student who selects “I did not reach this part” still receives “last explainable step” and “what did you do next” prompts. This can pressure the student to manufacture an answer.

Add explicit branch semantics for not-applicable, did-not-reach, declined, language-support, and early-exit states. Store a typed answer code rather than inferring branch meaning from display text.

### P1-5. Summary correction is missing

The false `studentConfirmedSummary` action write was removed, and selected actions resume correctly. However, completion still occurs before the student confirms or corrects the summary. The UI offers only next-step selection.

Separate summarize → correct/confirm → choose-action transitions. Store the student correction and provenance; do not overwrite the original interpretation.

### P1-6. Writes lack transactions, versions, and idempotency

Ownership and status checks are present, but concurrent requests can still read the same transcript length, create the same message ID, overwrite each other, or create duplicate crisis records. Lesson/question creation, summary/session completion, class-brief writes, and consent revocation are multi-write workflows without transactions.

Add optimistic version columns, unique idempotency keys, atomic repository operations, and exactly-once tests for normal and crisis turns.

### P1-7. Enrollment and tenancy are demo-only

The new inbox correctly withholds class lessons from unrostered self-signups, but the only enrollment source is the seeded in-process roster and the only class is `class-1`. There is no durable assignment, join/invite flow, tenant-aware roster import, or teacher share state.

Implement durable tenant/class enrollment and authorize every lesson, score, brief, and chat lookup through it.

### P1-8. Magic links are serverless-fragile

Tokens live in a global process Map. They can disappear between request instances. Missing production email variables cause a log-only sender while production UI still reports success. There is no request throttling or persistent token audit.

Store hashed, expiring, one-time tokens durably; require working email configuration in production; rate-limit requests; and bind tokens to intended tenant/role.

### P1-9. Runtime clocks and identifiers are test fixtures

Persistent composition still uses a fixed sequential clock and resetting sequence IDs. Restarts can produce synthetic timestamps and collisions.

Use wall-clock UTC timestamps and collision-safe IDs in runtime composition; reserve deterministic clocks for tests.

### P1-10. Provider disclosure and PII controls are incomplete

The default is safer now: student conversations are not sent to the model. When `ANTHROPIC_API_KEY` is set, teacher lesson text is sent for analysis/question drafting. PII configuration defaults empty, generic stripping is incomplete, and the data-flow inventory omits Anthropic and Resend.

Add an explicit administrator-controlled provider mode, complete provider agreements/retention rules, stronger de-identification, audit/cost logs, and accurate data-flow documentation.

### P1-11. Score authorization and calibration remain narrow

Prediction and score now refer to the same reflected work, and score entry occurs after reflection completion. However, score mutation does not prove teacher ownership/class membership at a durable tenant boundary, and one aggregate score may not represent the particular objective or episode named by the prompt.

Bind prediction and outcome to a shared assessment/task ID and scoring scale; enforce teacher/student/lesson membership; display “insufficient evidence” when the join is not exact.

### P1-12. Production operations are absent

There is no CI workflow, health/readiness endpoint, structured logging, monitoring, migration versioning, backup/restore procedure, retention job, delivery alerting, or incident runbook. The default gate skips 44 database/RLS/persistence tests.

Add deterministic CI gates for build, browser, database, RLS, and safety delivery; then add runtime observability and recovery procedures.

## P2 — remaining engineering gaps

1. Teacher score actions still need durable lesson ownership, roster membership, and tenant authorization.
2. Timeline actions retain legacy fallback identity behavior at their own boundary.
3. `confidenceLevel` still reflects number of extracted tags and answer length; that is implementation confidence, not confidence in a child’s truthfulness or state, and should be renamed or removed.
4. Lesson title/content, email, chat/model, score, upload, and crisis endpoints lack rate limits; several teacher inputs also need explicit maximums.
5. Photo selection reads files fully into browser memory; validation occurs after Server Action transport, and no object-storage policy exists.
6. `next/font/google` makes production builds network-dependent. Self-host Inter or use the system stack.
7. `next.config.ts` lacks CSP, HSTS, frame, referrer, permissions, and powered-by controls.
8. The landing inquiry form discards submissions while promising follow-up.
9. Landing copy still overstates automated calibration/intervention behavior.
10. A visible sign-out path is missing, which is risky on shared school devices.
11. Some non-chat controls remain below the chat’s 44 px target standard.

## Chat UI audit

| Dimension | Score | Current finding |
| --- | ---: | --- |
| Accessibility | 4/4 | Landmarks, live log, speaker labels, focus movement, error alerts, reduced motion, high contrast, keyboard/IME handling, and 44 px targets |
| Responsive design | 4/4 | `100svh`, safe areas, fixed composer, bounded option scroll, wrapping, mobile inbox layout |
| Interaction reliability | 4/4 | Resume, rollback, pending locks, typed-draft recovery, persisted selected action, loading/error/safety states |
| Theming | 4/4 | Semantic dark tokens mirrored in both token sources and scoped with native dark color scheme |
| Performance | 3/4 | Lean client surface and no build-time world initialization; full transcript still returns after every turn |
| **Total** | **19/20** | **The chat UI is no longer the release blocker** |

Measured contrast:

- primary text `#F7F9FA` on `#080A0D`: 18.77:1;
- muted text `#BBC5CD` on `#080A0D`: 11.31:1;
- muted text on `#12171C`: 10.28:1;
- control border `#607384` on `#12171C`: 3.68:1;
- accent `#A9C5DE` on `#080A0D`: 11.07:1.

Remaining chat-specific work:

- add typed branching for not-applicable answers;
- add summary correction/confirmation;
- add an explicit sign-out/leave policy for shared devices;
- avoid returning the complete transcript after every turn once persistence exists;
- test 320 px width, short landscape, 200% text, long translations, and virtual keyboards;
- return a minimal student-facing summary DTO instead of the full internal summary shape.

## Deployment assessment

The identified Vercel environment URL is:

`https://awareness-2fohj2wen-srikanthvishnu90-sketchs-projects.vercel.app`

It is protected by Vercel authentication and corresponds to GitHub revision `33852ce`. The changes described in this report exist only in the local working tree until they are committed and pushed. Even after deployment, the serverless environment should be treated as a UI preview—not a durable pilot—because intelligence repositories and photos are process-local.

## Recommended repair order

1. **Trusted identity and authorization:** opaque expiring sessions, no production staff demos, tenant/class/lesson checks everywhere.
2. **Durable product storage:** all intelligence repositories, photos, real clock/IDs, migrations, transactions, versions, and idempotency.
3. **Real safety operations:** required key/protocol, durable queue, monitored human delivery, retry worker, tenant-scoped acknowledgement, incident runbook.
4. **Evidence-first teacher intelligence:** remove self-report-only named groups; join reflection, prediction, and exact outcome before any adult consequence.
5. **Consent and lifecycle:** real enrollment, consent/lawful basis, accurate disclosure, export/correction/deletion/retention, minimized provider flows.
6. **Release engineering:** database/RLS/safety E2E in CI, offline-capable build, headers, rate limits, logs, health, monitoring, backup/restore.
7. **Product completion:** typed adaptive branches, summary correction, task-specific calibration, sign-out, responsive stress testing.

## Go/no-go

**No-go for a real student pilot.** The chat and question experience is suitable for a controlled product demonstration. Do not collect real student reflection or safety data until repair-order items 1–4 are independently verified.
