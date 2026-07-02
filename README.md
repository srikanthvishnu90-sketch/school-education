# plumb

A personal instrument for accurate academic self-knowledge. A student predicts their
performance, sees the truth, decomposes the gap to its atomic causes, and commits one
concrete next action.

**Read [CLAUDE.md](./CLAUDE.md) first.** It is the durable project context — purpose,
architecture (ports & adapters), hard guardrails, product-safety rules, and the domain
glossary. Every task inherits it.

## Stack

Next.js (App Router) · TypeScript (strict) · React · Tailwind CSS v4 · Vitest ·
ESLint · Prettier. Package manager: **pnpm**.

Current infrastructure = in-memory adapters only. No database, auth, backend, payment,
or LLM code until a task explicitly adds it.

## Scripts

| Script            | Does                                     |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Run the dev server                       |
| `pnpm build`      | Production build                         |
| `pnpm test`       | Run the test suite once (Vitest)         |
| `pnpm test:watch` | Watch mode                               |
| `pnpm typecheck`  | `tsc --noEmit`                           |
| `pnpm lint`       | ESLint                                   |
| `pnpm format`     | Prettier write                           |
| `pnpm check`      | typecheck + lint + test (run pre-commit) |

## Layout

    src/domain/          pure entities, value objects, invariants (no framework imports)
    src/domain/ports/    repository & service interfaces only
    src/domain/schemas/  Zod schemas mirroring domain types (future)
    src/application/     use-cases / services (orchestration)
    src/adapters/memory/ in-memory implementations of ports
    src/ui/              React components & the design system (tokens.ts)
    src/app/             Next.js routes
    test/                test helpers, fixtures

## Working loop

`.claude/commands/loop.md` defines the build → `pnpm check` → critique → fix loop, and
`.claude/agents/critic.md` is the reviewer that enforces the guardrails above.
