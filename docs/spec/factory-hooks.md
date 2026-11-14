# Factory Droid hooks

**Source:** https://docs.factory.com/harness/hooks (same text at https://docs.factory.com/cli/configuration/hooks-guide)
**Read:** 2026-11-14
**Depends on it:** `factory.hook.*`

Quoted:

> Hooks live alongside settings at each scope:

Scopes (table): User `~/.factory/hooks.json`; Project `.factory/hooks.json`; Enterprise (org-managed settings); Legacy `.factory/hooks/hooks.json` ("Still loads. The next save writes `.factory/hooks.json` and archives the old file as `hooks/hooks.migrated.json`.").

> If `hooks.json` is absent, Droid also reads hook declarations from the `hooks` key in the matching `settings.json`.

Standalone `hooks.json` is keyed directly by event name, with no top-level `hooks` wrapper. In `settings.json` the same event map sits under a top-level `hooks` key.

Handler fields (table):

| Field | Required | Source-validated behavior |
| :---- | :------- | :------------------------ |
| `matcher` | No | Empty, omitted, or `*` matches everything. Exact strings match one tool or lifecycle matcher. Regex patterns are supported and are case-sensitive. |
| `commandRegex` | No | Additional regex filter for Execute commands. |
| `hooks` | Yes | Array of hook commands for the matcher group. |
| `type` | Yes | Currently only `"command"` is supported. |
| `command` | Yes | Shell command executed with JSON hook input on stdin. |
| `timeout` | No | Per-command timeout in seconds. Defaults to `60`. |

> Always use absolute paths in hook commands.

Events (table, `Event` column): `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`, `SessionEnd`.

Tool matchers: `Execute`, `Read`, `Edit`, `Create`, `ApplyPatch`, `LS`, `Glob`, `Grep`, `Task`, `FetchUrl`, `WebSearch`. Quoted: "MCP tools use the `mcp__<server>__<tool>` naming pattern, so `mcp__.*` matches all MCP tools."

Exit codes: `0` success; `2` blocking or corrective feedback (`PreToolUse` blocks the tool call); other non-zero is non-blocking.

Blocking JSON on `PreToolUse`: `hookSpecificOutput.permissionDecision` with `allow`, `deny` or `ask`.

Hooks are disabled globally by `hooksDisabled` in settings.json (settings reference).

## Comparison with Claude Code settings hooks

The repo's capture of the Claude shape is `docs/spec/hook-sources.md` (the `hooks` object "is the same shape as the one in a settings file"). That capture was not re-fetched from Claude's own docs here.

- Same nesting: event name, then matcher groups (`matcher` plus `hooks` array), then handlers with `type: "command"`, `command`, `timeout`. The settings-embedded Factory form (top-level `hooks` key in `settings.json`) matches the Claude settings shape field for field.
- Different: Factory's standalone `hooks.json` has no top-level `hooks` key. A rule that expects `hooks` at the root of `.factory/hooks.json` will be wrong.
- Different: Factory adds `commandRegex`. Factory's `timeout` is in seconds with a default of 60.
- Factory's documented handler fields are `type`, `command`, `timeout` only. No `args` key is documented.

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| User | `~/.factory/hooks.json` | `--global` only |
| User (settings form) | `~/.factory/settings.json`, top-level `hooks` key | `--global` only |
| Project | `.factory/hooks.json` | yes |
| Project (settings form) | `.factory/settings.json`, top-level `hooks` key | yes |
| Legacy | `.factory/hooks/hooks.json` | yes, read as legacy |

## Unverified

- Whether `hooks.json` and the `hooks` key in `settings.json` merge when both exist. The page only says the settings key is read "If `hooks.json` is absent".
- Whether the project-level settings form is `.factory/settings.json`. The page says "the matching `settings.json`" and the settings reference lists `.factory/settings.json` only for `disabledSkills`.
- Whether `args` is accepted on a handler. Not documented.
- Whether `Notification` events other than those listed exist. Not stated.

## Staleness risk: HIGH
