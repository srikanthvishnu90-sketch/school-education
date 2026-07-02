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

## Psychological foundation (the product's steps derive from these; do not invent mechanics that contradict them)

- LOOP = Zimmerman's self-regulated learning cycle: forethought (goal + prediction) →
  performance → self-reflection (self-evaluation, causal attribution, self-reaction).
  The emotional axis IS Zimmerman's self-reaction subprocess, not an add-on.
- THREE QUESTIONS = Hattie & Timperley. Every cycle answers, for the student:
  Why does this matter? (feed-up / goal), Where am I really? (feed-back / evidence),
  Where to next? (feed-forward / next action). Feed-forward is the highest-value output.
- ACADEMIC decompose = metacognitive calibration (confidence vs. correctness).
- EMOTIONAL decompose = emotional granularity (Barrett): move the student from
  "good/bad" to differentiated, specific emotion labels. Higher granularity → better
  regulation. The product BUILDS granularity; it never tells a student their feeling is
  "wrong."
- MOTIVATION = Self-Determination Theory (Deci & Ryan): support autonomy (student owns
  the instrument), competence (evidence of mastery + a reachable next step), relatedness
  (teacher as ally). Extrinsic rewards and controlling/surveillance framing THWART
  motivation — this is the theoretical reason gamified rewards and admin-surveillance are
  forbidden, not just a style choice.
- DEVELOPMENT: adolescent metacognition is emerging but its ACCURACY is highly variable,
  so (a) externalize and scaffold the monitoring, never assume unaided accuracy, and
  (b) trust trajectory over any single self-judgment. The socioemotional system runs
  ahead of cognitive control ("hot" vs "cold"), so reflection happens in a COLD context
  after the feeling is named, and the UI stays calm and reward-free.
- SAFETY (Kluger & DeNisi): >1/3 of feedback interventions REDUCE performance; the cause
  is attention to the SELF. All feedback is task/process/strategy-focused, never
  self-focused. Reflect against a CORRECT exemplar (reflecting on one's own wrong answer
  can consolidate the misconception).
- Deliberately NOT used: growth-mindset framing as a load-bearing mechanic — its effects
  are small and contested in replications. We ground in SDT + attribution instead.

## Congruence is a flag, never a verdict

The academic-emotional congruence signal ("feels good about a 50") OPENS reflection; it
never asserts a "correct" feeling. Intervention on incongruence = increase granularity
(decompose the feeling), never prescribe an emotion. Congruence is always goal-referenced.

## AI = labor, not judgment

The language capability may DRAFT prompts, CLASSIFY free-text into taxonomies, and
NORMALIZE evidence data. It must never decide interventions, compute calibration, or
set safety outcomes. Deterministic default; schema-validated output; zero-LLM must work.

## Build standard (how we work, non-negotiable)

- Build under the assumption of PERFECTION. This is an exterior product a new person
  uses day-to-day: every surface, name, error, and edge case is built for that stranger,
  not for us. No rough edges shipped.
- Master each portion before moving on. Understand a piece fully — its invariants, its
  failure modes — before building the next one on top of it.
- When training or writing models/ML code, obey the principled rules: NO cheating. No
  data leakage (train/test separation), no target leakage, no fitting to the test set,
  no metric gaming. Honest evaluation or none.
- Take care of every warning. A warning is a defect until proven otherwise; resolve it,
  do not silence it.
