# Plan 053: Point VS Code hook provenance at the live hooks-reference URL

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/checks/registry.ts docs/spec/vscode-hooks.md scripts/spec-surfaces.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-09

## Why this matters

VS Code now has a dedicated schema page
https://code.visualstudio.com/docs/agents/reference/hooks-reference
(fetched 2026-09-06: eight events, `type: "command"` required). Registry
`vscode.hook.*` `source.url` still points only at
https://code.visualstudio.com/docs/agent-customization/hooks. `spec:check`
hashes registered URLs; if the event table moves to the reference page, drift
can miss it.

The 2026-09-06 read: **eight events still match** `VSCODE_HOOK_EVENTS`. This
plan does not change the event set unless the reference page disagrees.

## Current state

`src/checks/registry.ts` vscode hook entries use
`url: "https://code.visualstudio.com/docs/agent-customization/hooks"` and
`capture: "vscode-hooks.md"`.

`scripts/spec-surfaces.ts` — add the reference URL if missing (search the
file for `agent-customization/hooks`).

`docs/spec/vscode-hooks.md` — Source line should list both URLs, like
`docs/spec/gemini-hooks.md` Source + Also.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Spec | `bun run spec:check` | exit 0 after `spec:record` |

## Scope

**In scope**: `docs/spec/vscode-hooks.md`; `scripts/spec-surfaces.ts`;
`src/checks/registry.ts` `source.url` for vscode hook ids (keep the guide URL
as Also if the reference is primary); `bun run spec:record`; `bun run
readme:rules` if the README source column is generated from registry.

**Out of scope**: New events, new checks, 051/052 behavior.

## Git workflow

- Branch: `advisor/053-vscode-hooks-reference-url`
- Commit: `docs: track VS Code hooks-reference in spec drift`

## Steps

### Step 1: Re-read both pages

If the reference page's eight names differ from
`VSCODE_HOOK_EVENTS` in `src/facts/hook-schema.ts` lines 59–68 — **STOP**
and report the delta. Do not silently add names.

### Step 2: Dual-source capture + hash

Add the reference URL to the capture and `SPEC_SURFACES`. `spec:record`.
Point registry `source.url` at the page that contains the event table.

**Verify**: `bun run spec:check` exits 0. `bun test`. `bun run readme:rules`
if you changed registry URLs.

## Test plan

Existing vscode hook tests. No new ids.

## Done criteria

- [x] `spec:check` hashes the reference URL
- [x] Event set unchanged unless Step 1 STOP fired
- [x] `plans/README.md` updated

## STOP conditions

- Event count is not eight — STOP (new checks need a different plan).

## Maintenance notes

Reviewer: both URLs should stay in the capture so a guide rewrite still
trips drift.
