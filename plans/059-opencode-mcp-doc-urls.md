# Plan 059: Cite both OpenCode MCP URLs in spec drift

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- docs/spec/opencode-mcp.md src/checks/registry.ts scripts/spec-surfaces.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-15

## Why this matters

`docs/spec/opencode-mcp.md` already names both
https://opencode.ai/v2/docs/mcp-servers and
https://opencode.ai/docs/mcp-servers/. Registry `source.url` and
`SPEC_SURFACES` should hash **both** so a V2 table change cannot hide
behind a V1 page (or the reverse). 2026-09-06 fetches: V2 still
`mcp.servers`, `type` local/remote, local `command` argv, `{env:NAME}`
interpolation. Do not change checks unless a page disagrees.

## Current state

```1:9:docs/spec/opencode-mcp.md
# OpenCode MCP (V1 and V2)

**Source:** https://opencode.ai/v2/docs/mcp-servers
**Read:** 2026-09-03
**Depends on it:** `opencode.mcp.no-launch`, ...
Also consulted for V1 shape: https://opencode.ai/docs/mcp-servers/
```

Search `scripts/spec-surfaces.ts` for `opencode.ai`. If only one URL is
listed, add the other.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Spec | `bun run spec:check` | exit 0 after `spec:record` |
| Rules | `bun run readme:rules` | if registry URLs change |

## Scope

**In scope**: capture Also/Source; `SPEC_SURFACES`; `spec:record`; registry
`source.url` remains the V2 page unless V2 404s.

**Out of scope**: New OpenCode checks; global OpenCode config; changing
argv-array rules.

## Git workflow

- Branch: `advisor/059-opencode-mcp-doc-urls`
- Commit: `docs: hash both OpenCode MCP documentation URLs`

## Steps

### Step 1: Re-fetch both pages

If V2 no longer requires argv `command` — STOP (that would make
`opencode.mcp.command-not-array` a false positive).

If V1 page is gone, keep V2 only and note it in the capture.

### Step 2: Hash both

Add missing URL to `SPEC_SURFACES`. `spec:record`. Update `**Read:**`.

**Verify**: `bun run spec:check`. `bun test`.

## Test plan

Existing opencode MCP tests. No new ids.

## Done criteria

- [x] Both live URLs hashed, or capture explains a 404
- [x] Checks unchanged
- [x] `plans/README.md` updated

## STOP conditions

- V2 `command` is no longer an array — STOP.
- A third URL becomes canonical and contradicts V2 — STOP.

## Maintenance notes

Reviewer: `{env:NAME}` is already allowed in `src/discover/mcp.ts`
`INTERPOLATED`. Do not "fix" it in this plan.
