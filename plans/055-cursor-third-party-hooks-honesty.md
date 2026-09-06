# Plan 055: Document Cursor third-party import of Claude hook files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- docs/spec/cursor-hooks.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (do not wait on 050; Cursor import is a separate page)
- **Category**: docs
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-11

## Why this matters

https://cursor.com/docs/reference/third-party-hooks (fetched 2026-09-06) says
Cursor loads Claude Code hooks from `.claude/settings.local.json`,
`.claude/settings.json`, and `~/.claude/settings.json`, merged below native
Cursor hooks. agentscan already lints those files as **Claude**. README does
not say Cursor consumes them. That is an honesty gap, not a missing parse.

Do **not** parse `.claude/settings.json` as Cursor camelCase. Cursor maps
Claude names; the file remains a Claude document. Weakening Claude `type`
would reintroduce false negatives on Claude.

## Current state

Claude settings are discovered as Claude (`src/discover/hooks.ts`
`discoverHooks` / `discoverClaudeUserHooks`). Cursor project hooks are
`.cursor/hooks.json` only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass (docs-only expected) |
| Spec | `bun run spec:check` | exit 0 after adding the third-party URL if you hash it |

## Scope

**In scope**: `docs/spec/cursor-hooks.md` (or new
`docs/spec/cursor-third-party-hooks.md`); `SPEC_SURFACES` if hashed;
README Cursor coverage / Known limits sentence; no `src/` unless Step 1
proves a Cursor-only event is valid *in the Claude file* (then STOP and
treat like 050).

**Out of scope**: Dual-profile implementation; MDM/team; changing Claude
schema.

## Git workflow

- Branch: `advisor/055-cursor-third-party-hooks-honesty`
- Commit: `docs: Cursor third-party Claude hook import`

## Steps

### Step 1: Capture

Quote the priority list and the Claude file paths. Quote "Cursor
automatically maps Claude hook names". Record: agentscan lints Claude files
as Claude; Cursor mapping is not a second schema.

**Verify**: capture has `**Read:**` and the three Claude paths.

### Step 2: README

One sentence in the Cursor coverage/known-limits: Cursor may also run Claude
settings hooks; those files are still Claude-profiled.

**Verify**: `bun test && bun run spec:check`. No src diff.

## Test plan

None required. Optional: `PreToolUse` in `.claude/settings.json` still
Claude, not `cursor.hook.unknown-event`.

## Done criteria

- [x] Capture + README sentence
- [x] Claude `type` enum untouched
- [x] `plans/README.md` updated

## STOP conditions

- Page shows Copilot/Cursor camelCase keys inside `.claude/settings.json` as
  the stored format — STOP (that is 050-shaped dual-profile).

## Maintenance notes

Reviewer: this is allowed to be docs-only.
