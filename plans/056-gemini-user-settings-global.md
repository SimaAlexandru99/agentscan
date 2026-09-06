# Plan 056: Open Gemini user `~/.gemini/settings.json` under `--global`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/discover/index.ts src/discover/hooks.ts src/discover/mcp.ts docs/spec/gemini-hooks.md docs/spec/gemini-mcp.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (plan 042 left user settings unread on purpose: opening
  hooks without MCP, or attributing user hooks to the project)
- **Depends on**: none
- **Category**: discovery
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-12

## Why this matters

Gemini documents merge order: project `.gemini/settings.json`, then
`~/.gemini/settings.json`, then `/etc/gemini-cli/settings.json`, then
extensions. Project file is scanned for MCP **and** hooks. User file is
unread even under `--global` (`docs/spec/gemini-hooks.md` lines 17–23).
A user-level `BeforeTool` guard with a missing script is invisible.

Plan 042's reason for skipping `--global` was: wiring hooks but not MCP
(or the reverse) would mis-attribute. This plan opens **both** MCP and
hooks from the same user file, only under `--global`, with `source: global`
evidence.

`/etc/gemini-cli/settings.json` and extension hooks stay unread (machine-wide
/ unpublished install dir).

## Current state

- `discoverGeminiHooks(root)` reads `join(root, ".gemini", "settings.json")`
  (`src/discover/hooks.ts` ~770).
- Gemini MCP comes from `mcpPaths` including `.gemini/settings.json`
  (`src/config/schema.ts` line 28) — project-relative only.
- `--global` block does not call Gemini.
- Never open `~/.gemini/mcp-oauth-tokens.json`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Spec | `bun run spec:check` | exit 0 |

## Scope

**In scope**: user-file readers for hooks + MCP; `--global` only;
captures; README Gemini global cell; tests with homedir mock.

**Out of scope**: `/etc/gemini-cli/settings.json`; extension hooks; OAuth
token file; changing Gemini event list (057 may retarget URLs).

## Git workflow

- Branch: `advisor/056-gemini-user-settings-global`
- Commit: `feat: scan ~/.gemini/settings.json under --global`

## Steps

### Step 1: Capture

Update `docs/spec/gemini-hooks.md` and `gemini-mcp.md`: user file opened
under `--global`; system/extensions still unread; tokens never opened.

**Verify**: Deliberately unread lists match.

### Step 2: Discover both surfaces together

Add `discoverGeminiUserSettings(errors, projectRoot)` used only when
`opts.includeGlobal`. Parse the same schema as the project file
(`discoverGeminiHooks` + Gemini MCP parse). Tag facts so reports show
global. Do not add `~/.gemini/settings.json` to `mcpPaths`.

**Verify**: default scan ignores a planted user file. `--global` reports
`gemini.hook.missing-script` and `gemini.mcp.no-launch` from that file.

### Step 3: README + gates

**Verify**: `bun test && bun run typecheck && bun run spec:check`

## Test plan

Homedir mock. Both a hooks defect and an MCP no-launch in the user file.
OAuth token file in `~/.gemini/` must not become `config.unreadable`.

## Done criteria

- [x] Gates pass
- [x] User file not read without `--global`
- [x] Token file never opened
- [x] `plans/README.md` updated

## STOP conditions

- User settings schema differs from project (new keys that would
  `unexpected-shape` a valid file) — STOP.
- Opening the user file requires reading sibling credential files.

## Maintenance notes

Reviewer: 042's warning is satisfied only if MCP and hooks both land.
Do not merge a hooks-only user scan.
