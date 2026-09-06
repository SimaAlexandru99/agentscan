# Plan 050: Decide how Copilot-consumed `.claude/settings.json` is reported

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/discover/hooks.ts docs/spec/copilot-hooks.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH if dual-profiled wrongly (Copilot-only events accepted as
  Claude, or Claude `type` required dropped)
- **Depends on**: none
- **Category**: docs (may become discovery if the page requires dual-profile)
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-06

## Why this matters

GitHub Copilot CLI's hooks reference (fetched 2026-09-06) lists
`.claude/settings.json` and `.claude/settings.local.json` as hook sources
alongside `.github/copilot/settings.json`. agentscan parses those files as
Claude only (`discoverCopilotSettingsHooks` comment at
`src/discover/hooks.ts` lines 946–949). README Copilot precedence cell:
"`.claude/settings.json` stays Claude".

A Copilot-only event (`sessionEnd`, `userPromptTransformed`, …) in that file
is `claude.hook.unknown-event` today. That is true for Claude Code and false
for Copilot CLI if Copilot dispatches it from that file. Silence vs false
positive depends on what the page actually authorizes.

Do **not** weaken Claude handler `type` (required; five values).

## Current state

```946:962:src/discover/hooks.ts
 * these files are Copilot CLI config, not native VS Code hook documents, so
 * they do not need `version: 1`. `.claude/settings.json` stays on the Claude
 * profile. See docs/spec/copilot-hooks.md.
 */
export function discoverCopilotSettingsHooks(
  root: string,
  errors: ConfigErrorFact[],
): HookFact[] {
  return copilotSettingsHooksFromFiles(
    [
      join(root, ".github", "copilot", "settings.json"),
      join(root, ".github", "copilot", "settings.local.json"),
    ],
```

Project Claude settings are read in `discoverHooks` as profile `"claude"`.

Page to re-read: https://docs.github.com/en/copilot/reference/hooks-reference
section on cross-tool `.claude/settings.json`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Spec | `bun run spec:check` | exit 0 (recapture Copilot hooks if the quote moves) |

## Scope

**In scope**: `docs/spec/copilot-hooks.md`; `README.md` Copilot coverage
precedence cell; optionally `src/discover/hooks.ts` **only if** Step 1's
quote requires dual-profile; tests; `spec:record` if the Copilot URL hash
moves.

**Out of scope**: Remapping Claude `type: mcp_tool` / `agent` to Copilot.
Policy `/etc/github-copilot/policy.d`. Changing Claude event lists.

## Git workflow

- Branch: `advisor/050-copilot-claude-settings-honesty`
- Commit: `docs: record Copilot reading .claude/settings.json` or
  `feat: dual-profile Copilot events in Claude settings` — pick after Step 1.

## Steps

### Step 1: Quote the Copilot page

Fetch the hooks reference. Copy the exact sentences about `.claude/settings.json`
into `docs/spec/copilot-hooks.md` with `**Read:**` today.

Decision rule (do not improvise):

**A. Docs-only (default)** — the page says Copilot loads Claude hook configs
(Claude event names / Claude nested schema). Then:

- Keep Claude-only parsing.
- README: Copilot also *runs* these files; agentscan still *lints* them as
  Claude. A Copilot-only event name is `claude.hook.unknown-event` by design.
- Regression: `.claude/settings.json` with `sessionEnd` still emits
  `claude.hook.unknown-event`, not `copilot.hook.unknown-event`.

**B. Dual-profile** — the page explicitly lists Copilot-only event names as
valid in `.claude/settings.json`. Then:

- After Claude parse, events that are unknown to Claude but known to Copilot
  are re-emitted as `schemaProfile: "copilot-cli"` **without** dropping the
  Claude required-`type` check on handlers that are Claude-shaped.
- STOP if Copilot examples in that file are flat Copilot CLI entries
  (`bash`/`exec`) mixed into Claude nested groups — report; do not guess a
  merge.

**Verify**: the capture contains a blockquote, not a paraphrase.

### Step 2: Implement the chosen branch

Docs-only: README + capture + one regression test.

Dual-profile: discovery change + tests for (1) Claude `PreToolUse` still
Claude, (2) Copilot-only event not `claude.hook.unknown-event`, (3) missing
script still fires, (4) Claude `type` still required.

**Verify**: `bun test && bun run typecheck && bun run spec:check`

## Test plan

- Always: README/capture quote test is the capture file itself.
- Docs-only: `sessionEnd` in `.claude/settings.json` → `claude.hook.unknown-event`.
- Dual-profile: that same fixture → `copilot.hook.*` and not Claude unknown-event.

## Done criteria

- [x] Gates pass
- [x] Claude `type` enum unchanged
- [x] Coverage matrix Copilot cell no longer implies Copilot never reads
      `.claude/settings.json`
- [x] `plans/README.md` updated

## STOP conditions

- Handler shapes in the Copilot-in-Claude examples are neither Claude nested
  nor Copilot CLI command entries — STOP.
- Dual-profile would require accepting omitted `type` on a Claude file.

## Maintenance notes

Reviewer: the product choice must be one sentence in README. Ambiguous
"we kind of scan it twice" is worse than docs-only.
