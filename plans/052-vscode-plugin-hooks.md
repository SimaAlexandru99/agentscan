# Plan 052: Open VS Code plugin hook files only if the path is quoted

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/discover/plugins.ts src/discover/index.ts docs/spec/vscode-hooks.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/051-vscode-agent-frontmatter-hooks-profile.md
- **Category**: direction
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-08

## Why this matters

VS Code's agent-hooks page (2026-09-06) says plugins can include `hooks.json`
or `hooks/hooks.json`. Claude in-tree plugins are already discovered via
`.claude-plugin/plugin.json` (`src/discover/plugins.ts` `findPluginRoots` /
`discoverPluginHooks`) and parsed as **Claude**. If VS Code uses a different
manifest or a command-only schema, those files are either missed or parsed
with the wrong profile — the same class as 051.

## Current state

`discoverPluginHooks` (`src/discover/plugins.ts` 90–126) reads
`<pluginRoot>/hooks/hooks.json` through `hooksFromObject` **without**
`sourceProvider` (defaults Claude). Manifest: `.claude-plugin/plugin.json`.

VS Code page: https://code.visualstudio.com/docs/agent-customization/hooks
and https://code.visualstudio.com/docs/agent-customization/agent-plugins

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Spec | `bun run spec:check` | exit 0 |

## Scope

**In scope**: spec capture for VS Code plugin hook paths; discovery only for
quoted paths; vscode-native profile; tests; README unread vs scanned.

**Out of scope**: Marketplace install dirs outside the repo. Claude plugin
hooks (keep Claude). `chat.hookFilesLocations`.

## Git workflow

- Branch: `advisor/052-vscode-plugin-hooks`
- Commit: `feat: scan quoted VS Code plugin hook files` or
  `docs: record VS Code plugin hooks as unread` if Step 1 finds no path.

## Steps

### Step 1: Quote the plugin path

Fetch the VS Code plugin/hooks pages. If they quote a project-relative
manifest (for example `.github/plugin` / `plugin.json` / `hooks.json`),
capture it. If they only describe VS Code UI plugins with unpublished
install directories, write Deliberately unread and **stop after README** —
that is a successful docs-only outcome, not a failure.

**Verify**: capture has a path or an explicit unread reason.

### Step 2: Discover only if quoted

If a path exists: new finder, `hooksFromObject(..., "vscode", platform,
"vscode-native")`. Do not send VS Code plugin files through Claude nested
parse. Missing script → `vscode.hook.missing-script`.

**Verify**: fixture with quoted layout + missing script emits vscode ids only.

### Step 3: Gates

`bun test && bun run typecheck && bun run spec:check`

## Test plan

Only if discovery lands. Claude `.claude-plugin` plugins must still be Claude.

## Done criteria

- [x] Either discovery + vscode-native tests, or documented unread with quote
- [x] Claude plugin parse unchanged
- [x] `plans/README.md` updated

## STOP conditions

- Path is only under `~/.vscode/` or an extension gallery dir — unread;
  do not guess.
- Schema is not command-only — recapture; do not reuse vscode-native blindly.

## Maintenance notes

Reviewer: a docs-only finish is valid. Do not treat "no code" as incomplete
if the page has no project path.
