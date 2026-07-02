# plumb — project context

## Purpose

plumb is a personal instrument for accurate academic self-knowledge. A student
predicts their performance, sees the truth, decomposes the gap to its atomic causes,
and commits one concrete next action. The product's job is to move judgment from the
institution to the student and to close the gap between what a student believes about
their competence and what is objectively true — in either direction (overconfidence
AND underconfidence). We are building the ACADEMIC axis first; the emotional axis is
deferred.

## Architecture — ports & adapters (non-negotiable)

- `src/domain` is pure: no imports from next, react, or any adapter. Entities, value
  objects, and invariants only.
- All persistence and external services are accessed through interfaces in
  `src/domain/ports`. Implementations live in `src/adapters/*`.
- Business logic is testable without a browser, a database, or a network call.
- Current infrastructure = in-memory adapters only.

## Hard guardrails

- No database, auth, backend, payment, or LLM code until an explicit task adds it.
- No new dependency without justification in the task report.
- Every piece of non-trivial logic ships with unit tests.
- Prefer small, composable functions and pure functions for anything computational.
- Do not gold-plate. Build exactly what the task's Scope names; nothing more.

## Product safety rules (encode these as constraints, not decoration)

- Feedback is TASK-focused, never SELF-focused (Kluger & DeNisi: self-directed
  feedback can reduce performance). Copy and UI talk about the work, not the worth.
- NEVER color-code accuracy as green=good / red=bad. Alignment uses ink-tint; gaps use
  warm accent. Red and green are forbidden as accuracy semantics.
- No gamified reward animations (confetti, streaks) on correctness.
- Reflection resolves to CONTROLLABLE, SPECIFIC causes; steer away from stable/global
  causes ("I'm bad at math").

## Domain glossary (use these exact terms in code)

- prediction: a student's pre-registered estimate, captured BEFORE the outcome is
  known. Item-level confidence (probability 0..1) + a global predicted score (0..1).
- outcome: item-level correctness + points, revealed after prediction.
- calibration: correspondence between confidence and correctness.
  brier = mean over items of (confidence - correct)^2 (lower = better)
  bias = mean(confidence) - mean(correct) (>0 overconfident, <0 underconfident)
  resolution: ability to assign higher confidence to correct than incorrect items.
- reflection: constrained attribution (cause) + one concrete, dated next action.
- transfer probe: a fresh item served after "I get it now", to test real transfer
  vs. the fluency illusion.
- learning map: the externalized skill progression a student locates themselves on.

## Conventions

- TypeScript strict. No `any`. Explicit return types on exported functions.
- Commits: conventional commits (feat:, fix:, chore:, test:, refactor:).
- Run `pnpm check` before every commit; it must pass.

## Design tokens

The single source of truth is `src/ui/tokens.ts`, mirrored 1:1 into the Tailwind
`@theme` block in `src/app/globals.css`. Change one, change the other.

    Base:      white #FFFFFF, paper #F6F8FA
    Primary:   ink #1B3A5B, ink-tint #3E6187, ink-wash #E8EEF4
    Text:      #0F1B26 (ink-black), secondary #536878
    Accent:    warm #E0A06A  (affective/human moments ONLY, <=5% of surface, never text color)
    State:     aligned = ink-tint #3E6187 ; gap = warm #E0A06A
    Radius:    control 6px, card 12px
    Type:      sans = Inter (all data/academic UI); --font-voice serif slot reserved
