# plumb

A two-sided **reflection & learning-intelligence platform** for a classroom. A teacher
records what happened in a lesson; an AI turns it into a short, balanced reflection; each
student talks it through in a familiar chat; and their answers come back to the teacher as
one actionable class brief — never a diagnosis, never a ranking.

The product's job is to move judgment from the institution to the student and to make
every insight *actionable*: connect how a lesson **felt** to how it was **understood**,
and give both sides one concrete next step.

> **Read [CLAUDE.md](./CLAUDE.md) first.** It is the durable project context — purpose,
> architecture (ports & adapters), hard guardrails, product-safety rules, and the domain
> glossary. Every task inherits it.

## The two flows

### Teacher

1. **Sign in** as a teacher (the sign-in screen splits teacher / student up front).
2. **Enter the day's lesson** — a title, the type of class, a short summary of what
   happened, and optional **photos** of the board / anchor charts / student work.
3. The **AI reads the lesson** (topic, likely misconceptions, emotional pressure points)
   and drafts a short, balanced reflection — technical *and* emotional, 4–6 questions.
4. Once students have reflected, the lesson page shows the **class brief**: what the class
   understood, how it felt, what they did, the one relationship between those, a short
   plan, and **attention groups** (who to check on and why, in observed language).
5. **Enter graded scores** for the work — recorded *after the fact*, never a bet up front.

### Student

1. **Sign in** as a student.
2. **Reflect in a GPT-style chat** — one adaptive question at a time, with quick-reply
   chips for scales/choices and a free-text composer otherwise. Calm, reward-free, and
   colour-neutral (alignment reads ink, a gap reads warm — never red/green).
3. End on a **summary you can correct** and **one small next step** you choose.
4. **Timeline** — over time, each reflection is set beside its graded result so you can
   see whether your read on your own work is getting closer to the truth. This is the
   honest, *post-hoc* replacement for a pre-registered confidence bet.

**Safety:** if a student's message suggests a crisis, the chat yields to a calm, supportive
screen and the concern is routed to a counselor — decided by deterministic detection, never
by the model. The safety module is isolated to a single capture boundary.

## AI = labor, not judgment

The model only **drafts, classifies, and normalizes**. It never computes an outcome, sets a
safety result, or decides an intervention. Everything runs **with zero API key** on a
deterministic fallback; a key simply upgrades drafting quality. Free-text is classified into
closed taxonomies and validated against schemas before it is trusted.

## Stack

Next.js (App Router) · TypeScript (strict) · React · Tailwind CSS v4 · Zod · Vitest ·
ESLint · Prettier. Package manager: **pnpm**.

Infrastructure is **in-memory by default** (zero setup); a Postgres path self-provisions
when `DATABASE_URL` is set.

## Configuration & secrets

Every environment variable is **optional** — with none set, the app runs fully in-memory
with deterministic fallbacks. To enable an integration, copy the template and fill it in:

```bash
cp .env.example .env.local   # then add keys as needed
```

| Variable            | Enables                                                        |
| ------------------- | ------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | LLM-backed drafting (falls back to deterministic without it)  |
| `DATABASE_URL`      | Postgres persistence (self-provisions migrations + RLS)       |
| `RESEND_API_KEY` + `EMAIL_FROM` | Magic-link sign-in emails (else the dev link shows on-screen) |
| `PILOT_ACCESS_CODE` | Closed-pilot enrollment gate                                  |
| `CRISIS_KEY_HEX`    | AES-256-GCM key sealing crisis-escalation text                |

**Secrets never leave your machine.** `.env.local` and all key/credential material are
gitignored; only `.env.example` (placeholders only) is committed. Do not commit real keys —
if one is ever pushed, rotate it immediately.

## Scripts

| Script            | Does                                     |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Run the dev server                       |
| `pnpm build`      | Production build                         |
| `pnpm test`       | Run the test suite once (Vitest)         |
| `pnpm typecheck`  | `tsc --noEmit`                           |
| `pnpm lint`       | ESLint                                   |
| `pnpm check`      | typecheck + lint + test (run pre-commit) |

> Run `pnpm build` after any change to a `"use server"` module — that transform only runs
> during a build, so a bad export won't show up in `pnpm check`.

## Layout

    src/domain/               pure entities, value objects, invariants (no framework imports)
    src/domain/intelligence/  the reflection engine: lessons, questions, sessions, signals,
                              summaries, and the metacognition (reflection↔performance) math
    src/domain/ports/         repository & service interfaces only
    src/domain/schemas/       Zod schemas mirroring domain types (compile-time synced)
    src/adapters/             in-memory + Postgres implementations, the language gateway
    src/safety/               isolated crisis detection (one import boundary only)
    src/app/                  Next.js routes (signin · chat · lessons · timeline · escalations)
    test/                     unit tests, fixtures, contracts
