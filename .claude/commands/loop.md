---
description: Build → check → critique → fix loop. Never declare done with failing checks.
---

# /loop

Run the current task as a disciplined build-and-verify loop. Do not stop early.

## Procedure

1. **Read CLAUDE.md first.** Obey its architecture, guardrails, and product safety
   rules for everything below.
2. **Implement** exactly what the task's Scope names — nothing more (no gold-plating).
3. **Run `pnpm check`** (typecheck + lint + test). If it fails, fix and re-run until it
   passes. Never proceed with a red check.
4. **Invoke the critic** (see `.claude/agents/critic.md`). Give it the diff and the
   task's Acceptance criteria.
5. **Address every critic finding:**
   - Every **blocking** finding MUST be fixed.
   - Every **non-blocking** finding is either fixed or answered with an explicit
     one-line justification in the report.
6. **Repeat** steps 2–5 until `pnpm check` passes AND the critic returns no blocking
   findings.
7. **Report:** what changed, the dependency list (with a one-line justification for any
   new dep), the passing `pnpm check` output, and anything you were tempted to add but
   left out per Out of scope.

## Hard rules

- Never declare the task done while `pnpm check` fails.
- Never declare the task done while a blocking critic finding is open.
- New dependencies require justification in the report. When in doubt, STOP and leave a
  note instead of installing.
