# Antigravity hooks

**Source:** https://antigravity.google/docs/hooks
**Read:** 2026-11-12
**Depends on it:** `antigravity.hook.*`

The App, CLI, and IDE sections quote the same two paths. This is not Gemini
CLI's `.gemini/settings.json` hooks, and not `.agents/mcp_config.json` or
`.agents/skills`.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `<dir>/.agents/hooks.json` | yes, walk-up (a parent is opened; a subdirectory below the scan root is not). The page says workspace root, project root, or the open project |
| Global | `~/.gemini/config/hooks.json` | `--global` only |

Unread: a plugin's `hooks.json` (no fixed install directory) and
`~/.gemini/antigravity-cli/settings.json` (the CLI page says hooks there are
not loaded). `<app_data_dir>` (`~/.gemini/antigravity`, `antigravity-cli`,
`antigravity-ide`) is payload data, not a hooks file.

## Shape

The file maps a hook name (`my-linter-hook`) to a definition. The name is not
an event. `enabled: false` disables that definition and the scanner emits
nothing for it. Any other `enabled` value leaves it on. A non-boolean
`enabled` is one unexpected-shape error.

Every other key whose value is an array is an event. Inside that array, an
item with `matcher` or `hooks` is a group; a group with a missing or empty
`hooks` array is `antigravity.hook.invalid-group`. A non-string `matcher` is
the same id. An item with neither key is a direct handler. The documented
`SessionStart` and `PreInvocation` examples are direct handlers, so they are
not `invalid-group`.

`type` is optional and defaults to `"command"`. Only `"command"` is supported.
Anything else is `antigravity.hook.unknown-handler-type`. `command` is
required. `timeout` defaults to 30 seconds and the page quotes no range
(one example uses 10), so it is not checked.

Relative commands resolve against the scanned directory, the same way other
command hooks do.

## Events (6 names)

`SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`,
`PostInvocation`, `Stop`.

Matcher applies to `PreToolUse` and `PostToolUse` only. Tool names such as
`run_command` are matcher values, not events.
