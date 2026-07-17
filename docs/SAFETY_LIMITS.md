# plumb — Crisis Detection: How It Works and What It Misses

_For a district safety reviewer. This document describes the system as built, not as
marketed. Read it before relying on plumb's crisis routing._

## Summary

plumb screens student free text for language that may signal risk of self-harm and
**routes a signal to a designated human**. It is a routing aid, not an assessment.
It does not diagnose, score severity, or decide anything about a student — a trained
adult does. Detection is **deterministic** (a reviewable word/phrase list, no AI) and
runs **only when a student submits a message**.

## How detection works

1. **Where.** Every free-text message a student submits (reflection answers and the
   study chat) is screened at submit time, before anything else happens with it.
2. **How.** The text is normalized (Unicode NFKC, lowercase) and lightly
   de-obfuscated to catch common evasions — letter-spacing (`k i l l`), punctuation
   between letters (`s.u.i.c.i.d.e`), and character elongation (`killlll`). It is
   then matched against a **versioned lexicon** of explicit and concerning phrases.
3. **Tiers.** A match returns one of two tiers:
   - **tier_1** — explicit intent or a plan (e.g. self-directed statements of intent).
     Escalated immediately at high urgency.
   - **tier_2** — ideation-adjacent / concerning language. Escalated at lower urgency.
   - tier_1 outranks tier_2 when both could match.
4. **Recall-biased by design.** Because this path sends a student to a caring adult, a
   false positive (an adult is told, resources are shown) is acceptable and a false
   negative is not. The lexicon is deliberately tuned to over-route rather than miss.

## What happens on a hit

- An escalation is created with the student's text **encrypted at rest** (the raw text
  is never stored or emailed in plaintext).
- It is routed to the **school's designated counselor** via an active email
  notification (the email contains no student text — only a prompt to review the alert
  in the counselor console).
- If no counselor is configured for that school, or if delivery fails, an **operator
  fallback** fires and the escalation is flagged undelivered and **retried on a
  schedule until a counselor acknowledges it** — it is never silently dropped.
- The student is shown a calm resource screen (including the 988 Suicide & Crisis
  Lifeline) and told plainly that a school adult will be notified.
- This routing is the **one exception** to student-only privacy and **cannot be
  disabled** by any consent setting.

## What it does NOT catch — read this carefully

Detection is a lexicon over English text at submit time. It therefore **misses**:

- **Novel or paraphrased phrasing** not in the lexicon. A student expressing distress
  in words the list doesn't contain will not be flagged.
- **Any language other than English.**
- **Indirect, metaphorical, coded, or sarcastic** expression, and context that only a
  human would understand.
- **Text that is typed but never submitted** — screening happens on submit, not on
  keystrokes.
- **Images/photos** — only text is screened. A photo a teacher or student attaches is
  not analyzed for risk.
- **Anything outside plumb** — it sees only what a student writes inside the product.

It also does **not** assess how serious a situation is, distinguish a genuine crisis
from a quote or joke, or replace a school's mandated-reporting duties, professional
judgment, or ongoing human monitoring. It routes; people decide and act.

## Change control

The lexicon is a reviewable, versioned config (`src/safety/lexicon.ts`).

- Current version: **2026.07.03**.
- Every edit must bump `LEXICON_VERSION` and append a `LEXICON_CHANGELOG` entry with a
  content hash. A locked test fails CI on any content change that isn't recorded, so
  the lexicon cannot drift silently.
- The tier definitions and the detector are covered by tests, including explicit
  no-false-positive cases (e.g. "skill myself" and "kitchen" must not match).

## What a school must provide for this to work

- A **designated counselor** contact configured for the school (until then, alerts go
  to the operator fallback).
- A **staffed process** to monitor and act on the counselor console and the alert
  emails — plumb notifies, but a human must respond.
- An understanding that plumb is **not** a crisis service. In an emergency, contact
  local emergency services; in the U.S., call or text 988.
