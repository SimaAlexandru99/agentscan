# Plan 048: Scan Kilo Code Agent Skills directories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/facts/provider.ts src/config/schema.ts src/discover/index.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/047-roo-skills.md
- **Category**: direction
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-04

## Why this matters

Kilo implements Agent Skills at `.kilo/skills/` and `~/.kilo/skills/`, and
also loads `.agents/skills` (already scanned) and `.claude/skills` when
"Claude Code Compatibility" is enabled. A broken project skill is silent
today. Do not remap `.claude/skills` to Kilo — those files stay Claude.

## Current state

- `Provider` includes `"kilo"`; no skill path.
- Page: https://kilo.ai/docs/customize/skills (fetched 2026-09-06).
  Global `~/.kilo/skills/`; project `.kilo/skills/`; compatibility
  `.agents/skills/` and `.claude/skills/` (compat flag — unread as Kilo).
- Extra paths in `kilo.jsonc` — **unread** unless the page quotes a
  resolution base and schema. Do not invent `kilo.jsonc` parsing here.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec | `bun run spec:check` | exit 0 after recording the URL |

## Scope

**In scope**: `docs/spec/kilo-skills.md`; `SPEC_SURFACES`; `.kilo/skills` in
`skillPaths`; Agent Skills profile; provider `kilo`; `--global` `~/.kilo/skills`;
tests; README.

**Out of scope**: `kilo.jsonc` extra skill URLs; `.claude/skills` as Kilo;
Kilo MCP; Cloud Agent.

## Git workflow

- Branch: `advisor/048-kilo-skills`
- Commit: `feat: scan Kilo Code Agent Skills directories`

## Steps

### Step 1: Capture

Quote locations and Agent Skills fields. Deliberately unread: `kilo.jsonc`
extra paths, remote skill URLs, `.claude/skills` remapped as Kilo.

**Verify**: `bun run spec:check` after `spec:record`.

### Step 2: Wire discovery

`.kilo/skills` → agent-skills + provider kilo. `--global` `~/.kilo/skills`.

**Verify**: unit tests for valid skill, name mismatch, global malformed.

### Step 3: README

Update the Kilo coverage row. Gates: `bun test && bun run typecheck && bun run build && bun run spec:check`

## Test plan

`tests/unit/kilo-skills.test.ts`.

## Done criteria

- [x] Gates pass
- [x] `.claude/skills` still `sourceProvider: claude`
- [x] `plans/README.md` updated

## STOP conditions

- Page requires a Kilo-only frontmatter field that Agent Skills rejects —
  recapture; do not force the portable profile.
- Parsing `kilo.jsonc` looks necessary to find skills — STOP; extra paths
  stay unread.

## Maintenance notes

Reviewer: compatibility dirs must not change provider identity.
