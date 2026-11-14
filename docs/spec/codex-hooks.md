# Codex hooks

**Source:** https://learn.chatgpt.com/docs/hooks
**Read:** 2026-11-12
**Depends on it:** `codex.hook.*`

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `<dir>/.codex/hooks.json` | yes, walk-up (a parent is opened; a subdirectory below the scan root is not) |
| Project | `<dir>/.codex/config.toml` `[hooks]` | yes, same walk. MCP and `project_doc_*` in that file stay on their own readers |
| User | `$CODEX_HOME/hooks.json` or `~/.codex/hooks.json` | `--global` only |
| User | `$CODEX_HOME/config.toml` or `~/.codex/config.toml` `[hooks]` | `--global` only. The same file's `[mcp_servers]` stays `codex-toml` |

Both files in one layer are inventoried. The page says a layer that contains both warns at startup and merges them; that warning is not a finding. A higher layer does not replace a lower one. Project hooks load only when that `.codex/` layer is trusted; this scanner inventories the files anyway and does not model trust.

Unread: plugin `hooks/hooks.json`, `requirements.toml`, managed policy, system `/etc/codex`, and profile `$CODEX_HOME/<name>.config.toml`. `[features] hooks = false` turns hooks off at runtime and is not a shape error. `auth.json` is never opened.

## Shape

`hooks.json` is `{ description?, hooks: { Event: [group] } }`. A group is `{ matcher?, hooks: [handler] }`. Inline TOML `[[hooks.Event]]` / `[[hooks.Event.hooks]]` parses to the same object. A flat handler with no `hooks` array is `codex.hook.invalid-group`.

`type` does not default to `command`. A missing or unrecognised type is `codex.hook.unknown-handler-type`. `command` requires `command`. `mcp_tool` requires `server` and `tool` (`codex.hook.mcp-tool-without-server-or-tool`). `prompt` and `agent` are parsed but skipped (`codex.hook.incompatible-handler`). `SessionEnd` does not run `mcp_tool` (same id). `commandWindows` / `command_windows` is an optional Windows override and is not a separate check.

Relative commands are resolved against the scanned directory (the walk-up directory for a project file, the scan root for a user file), not the git root. The page prefers a git-root path because Codex may start in a subdirectory.

## Events (14 names)

`SessionStart`, `SessionEnd`, `SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `PreModelRequest`, `PostModelRequest`, `Interrupt`.

Tool names in matchers (`Bash`, `apply_patch`) are not events.

## Timeout

Omitted timeouts default to 600 seconds for most hooks, and the page quotes no maximum, so those values are not `codex.hook.timeout-out-of-bounds`. `SessionEnd` and `Interrupt` default to 1 second and a configured timeout must be in the closed range 1–3 seconds. The finding text says "want 1–3" only for those two events.

## `[hooks.state]` (2026-11-14)

Quoted (https://developers.openai.com/codex/hooks): "Codex records trust
against the hook's current hash, so new or changed hooks are marked for review
and skipped until trusted." Real `config.toml` files on two Windows machines
store that record as `[hooks.state."<file>:<event>:<i>:<j>"]` tables. agentscan
skips the `state` key under `[hooks]`; it is not a hook event.
