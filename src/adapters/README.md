# Adapters

Concrete implementations of the interfaces (ports) declared in `src/domain/ports`.
Nothing in `src/domain` may import from here — the dependency arrow points inward.

Current:

- `memory/` — in-memory adapters. The only infrastructure that exists right now.

Future (do NOT create until a task explicitly adds them):

- `supabase/` — persistence adapter.
- `llm/` — coach / LLM adapter behind a port.
