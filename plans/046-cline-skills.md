# Plan 046: Scan Cline skills (hooks only after a quoted event list)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/facts/provider.ts src/config/schema.ts src/discover/index.ts src/discover/skills.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/044-coverage-matrix-published-unread.md; serialize
  with 045/047–049 on `src/facts/provider.ts` and `src/config/schema.ts`
- **Category**: direction
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-02

## Why this matters

Cline documents Agent Skills-shaped packages at `.cline/skills/` and
`~/.cline/skills/`, with required `name` matching the directory and
`description` max 1024. The scanner treats `.cline` as a root signal and then
ignores those trees. A missing `SKILL.md` is invisible.

Hooks are **out of this plan** until
https://docs.cline.bot/customization/hooks quotes event names. The 2026-09-06
fetch returned a stub index, not a schema. Shipping `cline.hook.unknown-event`
from a guessed list is the false-positive class this repo exists to avoid.

## Current state

- `Provider` includes `"cline"`; `inferHookSchemaProfile` maps it to Claude —
  do not start discovering `.cline/hooks` under that mapping.
- `defaultConfig.skillPaths` (`src/config/schema.ts` lines 18–19) has no
  `.cline/skills`.
- `--global` skill dirs (`src/discover/index.ts` lines 165–171) have no
  `~/.cline/skills`.
- Config page (fetched 2026-09-06): project `.cline/{rules,skills,hooks,agents,plugins,cron}`;
  global `~/.cline/{rules,hooks,skills,agents,plugins}` and
  `~/.cline/data/settings/cline_mcp_settings.json`.
- Skills page: https://docs.cline.bot/customization/skills — `name` must match
  directory; `description` max 1024; keep SKILL.md under 5k tokens (do **not**
  add a token-budget check unless you label it info heuristic).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec | `bun run spec:check` | exit 0 after recording the skills URL |

## Scope

**In scope**:
- `docs/spec/cline-skills.md`
- `docs/spec/cline-config.md` (paths only; no hook events)
- `scripts/spec-surfaces.ts` + `spec:record`
- `src/config/schema.ts` `skillPaths` + `.cline/skills`
- `src/facts/provider.ts` `schemaProfileFromSkillsDir` → `agent-skills`;
  `providerFromSkillsDir` → `cline`
- `src/discover/index.ts` `--global` `join(home, ".cline", "skills")`
- Tests for Cline skills
- README coverage row for Cline (skills cells only)

**Out of scope**:
- `.cline/hooks` and `cline.hook.*` until the hooks page quotes events
- `.cline/agents` until a filename pattern and required fields are quoted
- `~/.cline/data/settings/cline_mcp_settings.json` MCP (user file; no project
  MCP path quoted — do not put it in `mcpPaths`)
- `~/Documents/Cline/` compatibility paths (optional later; not required)
- Executing plugins or cron

## Git workflow

- Branch: `advisor/046-cline-skills`
- Commit: `feat: scan Cline Agent Skills directories`
- Do NOT push unless asked.

## Steps

### Step 1: Capture

Write `docs/spec/cline-skills.md` from a live fetch of the skills page.
Quote required `name` / `description` / directory match. Quote skill
locations `.cline/skills/` and `~/.cline/skills/`. Record hooks/agents/MCP
paths as **Deliberately unread** with the reason (no quoted hook events /
no agent filename pattern / MCP is user-settings only).

**Verify**: capture has `**Read:**` a date; `bun run spec:record` then
`bun run spec:check` exits 0.

### Step 2: Discover skills

Add `.cline/skills` to default `skillPaths`. Map the dir to Agent Skills +
provider `cline`. Add `~/.cline/skills` to the `--global` list next to
`~/.commandcode/skills`.

**Verify**: unit test — `.cline/skills/aws-deploy/SKILL.md` with matching
`name: aws-deploy` and a description → zero `agent-skills.skill.*`.
`name: other` → `agent-skills.skill.name-does-not-match-directory`.
Missing SKILL.md → `skill.missing-skill-md`.

### Step 3: README

Cline project discovery: `.cline/skills`. Global: `--global` `~/.cline/skills`.
Schema: Agent Skills. Conformance: a small fixture or the unit tests.
Hooks/agents remain **unread**.

**Verify**: `bun test && bun run typecheck && bun run build && bun run spec:check`

## Test plan

- `tests/unit/cline-skills.test.ts` modeled on Agent Skills tests in
  `tests/unit/checks.test.ts` / windsurf skills tests.
- `--global` malformed skill carries `source: global` evidence.

## Done criteria

- [x] Gates above pass
- [x] No `cline.hook.*` ids
- [x] `plans/README.md` row updated

## STOP conditions

- Skills page no longer requires `name` matching the directory — recapture;
  do not keep the Agent Skills name-mismatch check if Cline contradicts it.
- You find a quoted hook event table — STOP and report; that is a follow-up
  plan, not a bonus in this one.
- You are about to add `cline_mcp_settings.json` to `mcpPaths` (would run on
  every non-global scan if given a relative path, and the file is global).

## Maintenance notes

- Reviewer: confirm hooks are named unread, not implemented.
- Follow-up: Cline hooks after a real event list; Cline agents after a path.
