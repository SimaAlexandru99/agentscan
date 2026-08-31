# Command Code hooks

**Source:** https://commandcode.ai/docs/hooks
**Read:** 2026-08-31
**Depends on it:** `commandcode.hook.unknown-event`, `commandcode.hook.invalid-group`, `commandcode.hook.command-without-command`, `commandcode.hook.unknown-handler-type`, `commandcode.hook.timeout-out-of-bounds`, `commandcode.hook.missing-script`

Also consulted: https://commandcode.ai/docs/settings (settings.local.json is a
settings layer; hooks is a top-level settings key)

## Files

The hooks page lists:

| Scope | File |
|-------|------|
| User | `~/.commandcode/settings.json` |
| Project | `.commandcode/settings.json` |

Project-local `.commandcode/settings.local.json` is a settings.json-family
file (settings page) and is read as a hook source. User settings only under
`--global`.

Do not apply Claude's 31-event list or Claude handler types (`http`,
`mcp_tool`, `prompt`, `agent`) to these files.

## Four events only

Quoted table: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`.

Need more of the session lifecycle? The page says that is mods, not hooks.

## Nested shape

```
settings.json → hooks → <event> → [ HookDefinition ]
                                    matcher (optional string)
                                    hooks (required array of HookEntry)
```

`hooks` on a HookDefinition is required. `matcher` is optional and must be a
string when present. A non-string matcher is `commandcode.hook.invalid-group`.

On `Stop` and `SessionStart` a matcher prevents the hook from firing — that
is Command Code runtime behaviour, not a schema error. This scanner does not
emit a finding for a string matcher on those events.

## HookEntry

| Field | Required | Type |
|-------|----------|------|
| `type` | yes | the string `"command"` only |
| `command` | when `type: "command"` | string (not an argv array) |
| `timeout` | no | seconds, default 30, maximum 600 |

Missing `type`, a non-string `type`, or a `type` other than `"command"` is
`commandcode.hook.unknown-handler-type`. A `command` that is missing, empty,
or a non-string (including a command array) is
`commandcode.hook.command-without-command`.

Command Code hook parsing is provider-specific and runs before generic
launch normalization. MCP's permissive `command` array support must not leak
into Command Code hooks.

Settings page: timeout is `0`–`600`. Values outside that closed range are
out of bounds. `async` and `failClosed` are mentioned on the settings page
and are not required-field checks.

## Placeholders

| Variable | Value |
|----------|--------|
| `COMMANDCODE_PROJECT_DIR` | Command Code project root (git root, or cwd outside a git repo) |
| `COMMANDCODE_CWD` | alias of `COMMANDCODE_PROJECT_DIR`, identical value |

Path-check local scripts conservatively: skip shell compounds, PATH binaries,
and unresolved interpolations. Expand the two placeholders above against the
project root the same way `${CLAUDE_PROJECT_DIR}` is expanded for Claude.

## Staleness risk: HIGH
