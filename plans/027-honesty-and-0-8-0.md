# Plan 027: Label heuristics, tell the truth in README, release 0.8.0

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- README.md src/version.ts package.json src/checks/budgets.ts src/checks/registry.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/026-namespace-claude-check-ids.md
- **Category**: docs
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

README claims “No AI, no network, no heuristics” and “every check sourced to a
published spec line”. Six checks are heuristics or installer policy. CLAUDE.md
budget reason cites “150–200 instructions / 50 used by the system prompt”,
which is not in official Claude memory docs. Product copy must match 0.8.0
coverage: Claude Code (partial), Agent Skills (profile), four MCP parsers.

## Current state

- `package.json` / `src/version.ts`: `0.7.0`
- README lines 8, 18, 62–67, 82: 27 checks, no heuristics, every check spec-sourced
- `src/checks/budgets.ts:140` unsourced CLAUDE.md reason
- Registry already has provenance from 021; confirm heuristic rows match this list:
  `skill.duplicate-description`, `skill.description-budget`, `skill.no-lockfile`,
  `skill.not-in-lock`, `budget.agents-md`, `budget.agents`, `budget.mcp`

## Scope

**In scope**: README, `docs/spec/thresholds.md` (CLAUDE.md section), budget reasons, version bump, coverage matrix, check-count badge, `docs/spec/README.md` wording if it still says every check is spec-backed without provenance.

**Out of scope**: 0.9.0 surfaces; deleting heuristic checks (keep at info).

## Steps

### Step 1: Rewrite budget reasons

`budget.claude-md`: quote official guidance to keep CLAUDE.md under approximately 200 lines (https://code.claude.com/docs/en/memory — re-fetch; if the page does not say ~200 lines, keep the check at info and say “vendor recommendation captured in docs/spec/thresholds.md” without the 150–200/50 sentence).

`budget.agents-md`, `budget.agents`, `budget.mcp`: reasons must say **heuristic** / proxy, not “measured as a spec”.

### Step 2: README

Replace the hero claim with: offline linter for Claude Code configuration, portable Agent Skills, and MCP files for VS Code, Cursor, Antigravity, and Codex (if 025 shipped Codex).

Drop “no heuristics”. Mention provenance.

Add a coverage matrix (full | partial | none) for 0.8.0 surfaces only:

| Ecosystem | instructions | skills | agents | hooks | MCP |
|-----------|--------------|--------|--------|-------|-----|
| Agent Skills | none | full (`.agents/skills`) | none | none | none |
| Claude Code | partial (root CLAUDE.md) | partial | partial (root `.claude/agents`) | partial | partial (`claude-json`) |
| AGENTS.md | partial (root file + line heuristic) | none | none | none | none |
| VS Code | none | none | none | none | partial (`.vscode/mcp.json`) |
| Cursor | none | inventory only | none | none | partial (`.cursor/mcp.json`) |
| Codex | none | inventory if under `.agents/skills` | none | none | partial if TOML shipped |
| Antigravity | none | via Agent Skills | none | none | partial (`serverUrl`) |

Update check count badge to the real `STRUCTURAL_CHECKS.length`.
Update the killer example rule id if 026 renamed it.
Update test-count badge only after `bun test` prints the new total.

### Step 3: Version

Set `package.json` and `src/version.ts` to `0.8.0`.

### Step 4: thresholds spec

Rewrite `docs/spec/thresholds.md` CLAUDE.md and AGENTS.md sections so confidence and provenance match (heuristic vs vendor-recommendation). Date `**Read:** 2026-08-30`.

**Verify**: `bun test && bun run typecheck && bun run build && bun run spec:check`

## Done criteria

- [ ] Version 0.8.0
- [ ] README does not claim every check is spec-sourced or that there are no heuristics
- [ ] Coverage matrix present
- [ ] CLAUDE.md reason has no “50 consumed by system prompt” line
- [ ] Gates green

## STOP conditions

- Changing default thresholds to silence findings
- Claiming 0.9.0 surfaces as full

## Maintenance notes

034 replaces the small matrix with the full provider table. Keep badges in sync with `STRUCTURAL_CHECKS.length` and `bun test` count.
