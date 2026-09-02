# Grok Build hooks

**Source:** https://docs.x.ai/build/features/hooks
**Read:** 2026-09-02 (14 events and command/http unchanged)
**Depends on it:** `grok.hook.unknown-event`, `grok.hook.unknown-handler-type`,
`grok.hook.command-without-command`, `grok.hook.http-without-url`,
`grok.hook.invalid-group`, `grok.hook.missing-script`

Do not apply Claude's 33-event list or Claude handler types (`mcp_tool`,
`prompt`, `agent`) to `.grok/hooks`. Compatibility reads of
`.claude/settings.json` and `.cursor/hooks.json` are unread as Grok sources.
Quoted (2026-09-02): "Claude Code (`.claude/settings.json`) and Cursor
(`.cursor/hooks.json`) hook files are read as well, including Cursor's
camelCase event names." Those files keep their own provider schema here.

## Files

| Scope | Path |
|-------|------|
| Project | `.grok/hooks/*.json` (walked with the scan) |
| User | `$GROK_HOME/hooks/*.json` or `~/.grok/hooks/*.json` | `--global` only |

Quoted: hooks are JSON files. Extra roots via `~/.grok/hooks-paths` and
plugin hooks are unread. `~/.grok/trusted_folders.toml` is unread.

Do not reuse the VS Code hook-directory reader: that remaps `version: 1` to
Copilot CLI and labels the source as VS Code.

## Events

Quoted table on the hooks page (14 names):

`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `Stop`,
`StopFailure`, `Notification`, `SubagentStart`, `SubagentStop`,
`PreCompact`, `PostCompact`.

An unrecognised name is `grok.hook.unknown-event`.

## Nested shape

Quoted example:

```
hooks → <event> → [ { matcher?, hooks: [ HookEntry ] } ]
```

`matcher` is a regular expression; omit it to match everything. When
present it must be a string. `hooks` on a group is required. A missing
array or a non-string matcher is `grok.hook.invalid-group`.

## HookEntry

Quoted: `type` is `"command"` or `"http"` (with a `url` to POST).
`timeout` is in seconds, default 5. No published numeric range — do not
emit a timeout-bounds check.

| Field | Required | Type |
|-------|----------|------|
| `type` | yes | `"command"` or `"http"` |
| `command` | when `type: "command"` | string |
| `url` | when `type: "http"` | string |
| `timeout` | no | seconds, default 5 |

Missing `type`, or a type other than `command` / `http`, is
`grok.hook.unknown-handler-type`. A command handler without `command` is
`grok.hook.command-without-command`. An http handler without `url` is
`grok.hook.http-without-url`.

Path-check local scripts conservatively: skip shell compounds, PATH
binaries, and unresolved interpolations. Do not invent `$GROK_*` path
expansion unless a page quotes it as a config interpolation.

## Staleness risk: HIGH
