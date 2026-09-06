# Plan 057: Point Gemini spec provenance at geminicli.com (keep GitHub for the underscore quote)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/checks/registry.ts docs/spec/gemini-hooks.md docs/spec/gemini-mcp.md scripts/spec-surfaces.ts scripts/spec-drift.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (can land before or after 056)
- **Category**: docs
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-13

## Why this matters

Live HTML docs are at https://geminicli.com/docs/hooks/ and
https://geminicli.com/docs/tools/mcp-server/ (fetched 2026-09-06). Registry
and `SPEC_SURFACES` still hash GitHub blob URLs. The underscore-alias
**warning is still quoted** on
https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md
(fetched 2026-09-06). geminicli.com MCP page describes FQN
`mcp_{serverName}_{toolName}` but the "fail silently" sentence was on GitHub.

If `spec:check` only hashes GitHub, a geminicli.com event-table change can
be missed. If it only hashes geminicli.com, the underscore warning can rot.

## Current state

Registry Gemini hook/MCP `source.url` values are GitHub blob URLs
(`src/checks/registry.ts` ~387–394, ~743–771).
`scripts/spec-surfaces.ts` same three GitHub URLs.
`docs/spec/gemini-hooks.md` Source: GitHub hooks/index.md.
`scripts/spec-drift.ts` may special-case the GitHub hooks URL for event diff
(line ~334).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Spec | `bun run spec:check` | exit 0 after `spec:record` |
| Rules | `bun run readme:rules` | README source column matches registry |

## Scope

**In scope**: captures (Source + Also); `SPEC_SURFACES` (both hosts);
registry `source.url`; `spec-drift.ts` event-diff URL if it is hardcoded;
`spec:record`; README via `readme:rules`.

**Out of scope**: Changing the 11 events or underscore check unless a page
disagrees (then STOP). 056 discovery.

## Git workflow

- Branch: `advisor/057-gemini-canonical-doc-urls`
- Commit: `docs: hash geminicli.com Gemini hook and MCP pages`

## Steps

### Step 1: Compare event tables

geminicli.com hooks table vs `GEMINI_HOOK_EVENTS` in `src/facts/gemini.ts`
lines 10–22. If they differ, STOP.

Confirm GitHub raw still contains "Do not use underscores" / "fail silently".
Keep that URL in `gemini-mcp.md` as the quote source for
`gemini.mcp.underscore-alias`.

### Step 2: Dual-hash

`SPEC_SURFACES`: geminicli.com hooks, hooks/reference, mcp-server, **and**
GitHub mcp-server.md (underscore). Registry hook ids: geminicli.com/docs/hooks/.
Registry MCP ids: GitHub or geminicli.com — MCP launch fields must be quoted
from the URL you set as `source.url`.

`spec:record`. Update captures' Source/Also.

**Verify**: `bun run spec:check`. `bun run readme:rules`. `bun test`.

## Test plan

Existing gemini tests. `tests/unit/spec-hashes.test.ts` may list fetch URL
helpers — update if it hardcodes GitHub blob.

## Done criteria

- [x] `spec:check` hashes geminicli.com pages
- [x] Underscore warning still has a hashed GitHub (or raw) source
- [x] 11 events unchanged
- [x] `plans/README.md` updated

## STOP conditions

- Event names differ across the two hosts — STOP; do not pick silently.
- Underscore warning gone from both — STOP before deleting the check;
  that is a separate recapture.

## Maintenance notes

Reviewer: blob HTML vs raw markdown may hash differently; use the same
fetch helper `fetchUrlFor` already used for GitHub blob.
