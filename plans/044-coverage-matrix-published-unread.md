# Plan 044: Tell the truth that Kiro/Cline/Roo/Kilo/Junie pages exist and stay unread

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- README.md docs/spec/check-inventory.md docs/spec/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-16 (TinyFish verify 2026-09-06)

## Why this matters

The coverage matrix is the honesty contract: a documented location that is not
opened stays **unread**. The Kiro / Cline / Roo / Kilo / Junie rows currently
say `none` in every cell, and `docs/spec/check-inventory.md` says they stay
unread because there is "no published check surface." That sentence is false as
of 2026-09-06: those vendors publish hooks/skills/agents pages. The scanner
still does not open the files. Saying `none` hides the gap; saying **unread**
with named paths is the same contract used for Gemini user settings.

This plan does **not** add checks. Plans 045–049 implement scanners after
captures. This plan only stops the README from claiming the pages do not exist.

## Current state

`README.md` coverage table (lines 607–611):

```
| Kiro | none | none | none | n/a | none |
| Cline | none | none | none | n/a | none |
| Roo | none | none | none | n/a | none |
| Kilo | none | none | none | n/a | none |
| OpenCode | `opencode.json(c)` V1 and V2 | none | ...
| Junie | none | none | none | n/a | none |
```

`docs/spec/check-inventory.md` (around line 44):

```
Kiro / Cline / Roo / Kilo / Junie stay unread (no published check surface).
```

Root signals already exist so a tree with only `.kiro/` is scannable, then
produces no provider checks (`src/discover/shared.ts` `AGENT_CONFIG_SIGNALS`
includes `.kiro`, `.cline`, `.roo`, `.kilo`, `.junie`). Do not change that here.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `bun test` | all pass (no code change expected) |
| Spec | `bun run spec:check` | exit 0 |

## Scope

**In scope**:
- `README.md` — five coverage rows + Known limits bullets if a sentence still
  says "no published check surface"
- `docs/spec/check-inventory.md` — the unread sentence
- `docs/spec/README.md` — only if you add a pointer row; not required

**Out of scope**:
- Any `src/` change, new check ids, discovery, version bump
- Implementing Kiro/Cline/Roo/Kilo/Junie (045–049)
- Changing OpenCode / Continue / Antigravity rows

## Git workflow

- Branch: `advisor/044-coverage-matrix-published-unread`
- Commit: `docs: name Kiro/Cline/Roo/Kilo/Junie as published and unread`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite the five coverage rows

Use the five-dimension contract already in the README (project discovery /
global discovery / schema / precedence / conformance). Each cell that is not
opened is **unread**, not `none`, once a path is named.

Locked wording (edit only if a live page contradicts a path; then STOP):

| Ecosystem | project discovery | global discovery | schema | precedence | conformance |
|-----------|-------------------|------------------|--------|------------|-------------|
| Kiro | unread `.kiro/hooks/*.json`, `.kiro/skills` (pages exist; scanner does not open them — plan 045) | unread `~/.kiro/skills` | unread | n/a | none |
| Cline | unread `.cline/skills`, `.cline/hooks`, `.cline/agents`, `.cline/rules` (plan 046) | unread `~/.cline/*` | unread | n/a | none |
| Roo | unread `.roo/skills` (plan 047) | unread `~/.roo/skills` | unread | n/a | none |
| Kilo | unread `.kilo/skills` (plan 048) | unread `~/.kilo/skills` | unread | n/a | none |
| Junie | unread `.junie/skills` (plan 049) | unread `~/.junie/skills` | unread | n/a | none |

Keep OpenCode between Kilo and Junie as it is today.

**Verify**: `rg "no published check surface" README.md docs/spec` → no matches.
`rg "\\| Kiro \\|" README.md` shows `unread` not `none` in project discovery.

### Step 2: Fix the inventory sentence

In `docs/spec/check-inventory.md` replace the "no published check surface"
line with: pages were read 2026-09-06; the scanner still does not open those
trees; see plans 045–049.

**Verify**: `rg "no published check surface" docs/spec/check-inventory.md` → no matches.

## Test plan

- No new tests. `bun test` must still pass (docs only).

## Done criteria

- [x] `bun run typecheck` exits 0
- [x] `bun test` exits 0
- [x] `bun run spec:check` exits 0
- [x] Coverage rows name published paths; they do not say the vendors have no pages
- [x] Docs-only for 044; src/ changes belong to 045–049
- [x] `plans/README.md` status row updated

## STOP conditions

- A vendor page you re-open has been removed or no longer names the paths above
  — do not invent replacements.
- You feel the need to add a check or discovery path — that is 045–049.

## Maintenance notes

- 045–049 each replace their row's `unread` cells with what they actually open.
- Reviewer: the matrix must not use `full`/`partial`; unread is the only honest
  word for a named path that is not opened.
