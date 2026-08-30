# Plan 028: Discover instruction files with real precedence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/discover/policy.ts src/config/schema.ts src/checks/budgets.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/027-honesty-and-0-8-0.md (0.8.0 shipped)
- **Category**: direction
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

Only root `AGENTS.md` and `CLAUDE.md` are read (`policyFiles` defaults). The
AGENTS.md standard allows nested files (nearest wins). Claude loads `CLAUDE.md`
along the path to the repo root. Codex has a configurable instruction-file
byte budget. VS Code uses `.github/copilot-instructions.md` and
`*.instructions.md`. Cursor has rules. A 150-line AGENTS.md threshold is not
normative.

## Spec captures (do first)

Fetch and write under `docs/spec/` with `**Read:**` the day you execute:
- https://agents.md/
- https://code.claude.com/docs/en/memory
- https://developers.openai.com/codex/guides/agents-md (and config for the 32 KiB default if still documented)
- https://code.visualstudio.com/docs/copilot/customization/copilot-instructions
- Cursor official rules/instructions page (start at https://cursor.com/docs)

STOP if a page cannot be fetched — implement only the captured providers.

## Scope

**In scope**: `src/discover/policy.ts`, policy fact type (add `sourceProvider`, `scope`, `precedence`), budgets that are vendor-backed, config defaults, tests.

**Out of scope**: Inventing a 150-line AGENTS.md requirement; counting “instructions” as a proxy for lines unless the spec says so.

## Steps

1. Capture specs.
2. Walk from scan start / root: collect nested `AGENTS.md`; record nearest-wins precedence on facts. Still no error for missing fields (Markdown is freeform).
3. Claude: collect `CLAUDE.md` from root and intervening directories if the memory page still says so; keep `budget.claude-md` on the file the session actually concatenates, or on each file separately — pick what the spec supports and document it.
4. Codex: if a 32 KiB (or current) cumulative cap is documented, emit `codex.budget.instructions` at info when exceeded. Do not apply that cap to Claude.
5. VS Code: discover `.github/copilot-instructions.md` and `**/*.instructions.md` with a depth cap (`NESTED_DISCOVERY_MAX_DEPTH`). No required-field checks unless the page lists them.
6. Cursor: discover documented rule paths only.
7. Tests: nested AGENTS.md is found; nearest file is tagged; official empty-ish examples produce zero errors.

## Done criteria

- [ ] Spec files exist for every implemented surface
- [ ] Root-only limitation is gone for captured providers
- [ ] `budget.agents-md` remains heuristic/info, not “spec-required”
- [ ] Gates green

## STOP conditions

- No official source for a provider — skip that provider.
- Network on `agentscan check`.

## Maintenance notes

034 lists instructions coverage as full/partial/none from this plan’s actual discovery.
