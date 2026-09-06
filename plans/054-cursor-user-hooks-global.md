# Plan 054: Open `~/.cursor/hooks.json` under `--global`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/discover/index.ts src/discover/cursor.ts docs/spec/cursor-hooks.md README.md`
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
- **Issue ID**: I-10

## Why this matters

Cursor documents user hooks at `~/.cursor/hooks.json`. Project
`.cursor/hooks.json` is already scanned (`discoverCursorHooksFile` in
`src/discover/index.ts` lines 221–223). README already lists the user file as
**unread**. A missing user-level guard script is the headline failure, same
as Claude user settings in plan 040.

MDM/team dashboard hooks stay unread (no local file, or paths outside the
repo, unless quoted).

## Current state

- Project: `discoverCursorHooksFile(join(dir, ".cursor", "hooks.json"), dir, …)`
- `--global` block (`src/discover/index.ts` 276–330) has no Cursor user hooks.
- Capture `docs/spec/cursor-hooks.md` already names `~/.cursor/hooks.json` as
  unread (plan 042).
- Third-party page priority: Enterprise → Team → Project → User → Claude files
  (https://cursor.com/docs/reference/third-party-hooks). User file is item 4.

Reuse `discoverCursorHooksFile`. Script resolve base for user hooks: the
Cursor page for **project** hooks says "Run from the project root". For the
user file, quote the live page. If it says user hooks run from the scanned
project root, pass that root as `project` (Claude user hooks do this). If it
says they run from `~/.cursor`, pass that. Do not guess.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Spec | `bun run spec:check` | exit 0 |

## Scope

**In scope**: `src/discover/index.ts` `--global` call;
`src/discover/cursor.ts` only if a helper for the home path is needed;
`docs/spec/cursor-hooks.md`; README global discovery cell; tests that mock
homedir.

**Out of scope**: MDM `/etc/cursor/hooks.json` and dashboard team hooks
unless the page gives a readable local path. Dual-profile of Claude files
(055). Version bump.

## Git workflow

- Branch: `advisor/054-cursor-user-hooks-global`
- Commit: `feat: scan ~/.cursor/hooks.json under --global`

## Steps

### Step 1: Quote cwd for user hooks

Update `docs/spec/cursor-hooks.md`: user file is opened under `--global`;
quote script cwd. MDM/team remain unread.

**Verify**: capture date updated.

### Step 2: Discover under `--global` only

In the `if (opts.includeGlobal)` block, after Copilot user hooks:

```
hooks.push(
  ...discoverCursorHooksFile(
    join(homedir(), ".cursor", "hooks.json"),
    /* project base: quoted */,
    configErrors,
  ),
);
```

Do **not** add `~/.cursor/hooks.json` to a project-relative path list.

**Verify**: without `--global`, user file is ignored. With `includeGlobal:
true`, missing script in user file emits `cursor.hook.missing-script` with
global evidence (match Copilot/Claude user tests).

### Step 3: README

Cursor global discovery: `--global` `~/.cursor/hooks.json`; still unread MDM
and team.

**Verify**: `bun test && bun run typecheck && bun run spec:check`

## Test plan

Mirror Claude/Copilot `--global` hook tests. Homedir mock + env helper
`tests/helpers/env.ts`.

## Done criteria

- [x] Gates pass
- [x] Default scan does not open `~/.cursor/hooks.json`
- [x] `plans/README.md` updated

## STOP conditions

- User hooks page says they are not JSON or not `hooks.json` — recapture.
- Script base is neither project root nor `~/.cursor` — STOP.

## Maintenance notes

Reviewer: findings must be distinguishable from project `.cursor/hooks.json`
(absolute path / `source: global` evidence).
