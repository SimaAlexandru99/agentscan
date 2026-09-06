# Plan 058: Open Antigravity global MCP under `--global`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/discover/index.ts src/discover/mcp.ts docs/spec/antigravity-mcp.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: discovery
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-14

## Why this matters

https://antigravity.google/docs/mcp/ (fetched 2026-09-06) names:

- Workspace: `.agents/mcp_config.json` (already scanned, `antigravity-json`)
- Global: `~/.gemini/config/mcp_config.json` (2.0 / CLI primary)

`docs/spec/antigravity-mcp.md` already records the global path as unread on
a normal project scan. README global cell is `none`. A global server with
neither `command` nor `serverUrl` is silent unless `--global` opens the file.

Do not treat `url` / `httpUrl` as launch (capture still says unsupported).

## Current state

```7:10:docs/spec/antigravity-mcp.md
Workspace local setup: `.agents/mcp_config.json`.
Global (unread on a normal project scan): `~/.gemini/config/mcp_config.json`.
```

`mcpProfileFromPath` maps `.agents/mcp_config.json` to `antigravity-json`
(`src/facts/provider.ts` ~151–155). The global file needs the same profile
(same `mcpServers` / `command` / `serverUrl` shape). Add a path matcher for
`/.gemini/config/mcp_config.json` so it is not parsed as Claude.

`--global` must not put this path in `defaultConfig.mcpPaths` (that would
open it on every project scan if someone used a tilde — keep it explicit).

Never open `~/.gemini/mcp-oauth-tokens.json`. If 056 also lands, both may
touch `--global`; serialize merges on `src/discover/index.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Spec | `bun run spec:check` | exit 0 |

## Scope

**In scope**: global file reader; `mcpProfileFromPath`; `--global` only;
capture + README; tests.

**Out of scope**: Antigravity hooks/rules (none quoted). Changing
`antigravity.mcp.no-launch`. SDK-only config.

## Git workflow

- Branch: `advisor/058-antigravity-global-mcp`
- Commit: `feat: scan Antigravity ~/.gemini/config/mcp_config.json under --global`

## Steps

### Step 1: Capture

Update `docs/spec/antigravity-mcp.md`: global file opened under `--global`;
project file still default. Re-quote `command` / `serverUrl`.

**Verify**: Read date updated.

### Step 2: Discover

`mcpProfileFromPath`: `mcp_config.json` under `.gemini/config/` →
`antigravity-json`. `--global`: parse
`join(homedir(), ".gemini", "config", "mcp_config.json")` with the existing
Antigravity parser. Tag global. Skip missing file (no `config.unreadable`).

**Verify**: default scan ignores a planted global file. `--global` +
`{ "mcpServers": { "x": {} } }` → `antigravity.mcp.no-launch`.
`{ "mcpServers": { "x": { "url": "https://example" } } }` still no-launch
(`url` unsupported). `{ "serverUrl": "https://example" }` clean.

### Step 3: README + gates

**Verify**: `bun test && bun run typecheck && bun run spec:check`

## Test plan

`tests/unit/` next to existing antigravity MCP tests. Homedir mock.

## Done criteria

- [x] Gates pass
- [x] Global file not read without `--global`
- [x] `url`-only still `antigravity.mcp.no-launch`
- [x] `plans/README.md` updated

## STOP conditions

- Live page now accepts `url` as launch — STOP (false positive if we keep
  rejecting it). Recapture first.
- File is not JSON / not `mcpServers` — STOP.

## Maintenance notes

Reviewer: this is the same file 056 might consider; 056 is
`~/.gemini/settings.json` (Gemini CLI), this is
`~/.gemini/config/mcp_config.json` (Antigravity). Do not parse one with the
other's schema.
