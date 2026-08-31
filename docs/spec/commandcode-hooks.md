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

`hooks` on a HookDefinition is required. `matcher` is optional; on `Stop` and
`SessionStart` a matcher prevents the hook from firing — that is runtime, not
a schema error this scanner invents.

## HookEntry

| Field | Required | Type |
|-------|----------|------|
| `type` | yes | `"command"` only |
| `command` | when `type: "command"` | string |
| `timeout` | no | seconds, default 30, maximum 600 |

Settings page: timeout is `0`–`600`. Values outside that closed range are
out of bounds. `async` and `failClosed` are mentioned on the settings page
and are not required-field checks.

## Placeholders

| Variable | Value |
|----------|--------|
| `COMMANDCODE_PROJECT_DIR` | project root (same as `cwd`) |
| `COMMANDCODE_CWD` | alias of `COMMANDCODE_PROJECT_DIR`, identical value |

Path-check local scripts conservatively: skip shell compounds, PATH binaries,
and unresolved interpolations. Expand the two placeholders above against the
project root the same way `${CLAUDE_PROJECT_DIR}` is expanded for Claude.

## Staleness risk: HIGH
