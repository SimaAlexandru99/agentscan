# Devin CLI hooks

**Source:** https://docs.devin.ai/cli/extensibility/hooks/overview
**Read:** 2026-11-14
**Depends on it:** `devin.hook.*`

Re-read 2026-11-14: URL unchanged. Event table, file locations and the
`hooks.v1.json` root shape still match. Devin Local's page
(https://docs.devin.ai/desktop/devin-local/customizations) links here for its
hook events.

Not the legacy Cascade snake_case file. That contract stays
[windsurf-hooks.md](windsurf-hooks.md). `.claude/settings.json` and
`~/.claude.json` stay the Claude profile even though Devin also loads them.

## Files

| Scope | Path | Shape | Opened by agentscan |
|-------|------|-------|---------------------|
| Project | `.devin/hooks.v1.json` | the file **is** the hooks object | yes, walk-up |
| Project | `.devin/config.json`, `.devin/config.local.json` | `"hooks"` key | yes, walk-up |
| User | `~/.config/devin/config.json` | `"hooks"` key | `--global` only |
| Claude settings | `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude.json`, `~/.claude/settings.json` | Claude format | scanned as Claude, not twice |

Windows user config is `%APPDATA%\devin\config.json`. Unread.

Quoted example (the root of `hooks.v1.json`):

```json
{
  "PreToolUse": [
    {
      "matcher": "exec",
      "hooks": [
        { "type": "command", "command": "./scripts/check-command.sh" }
      ]
    }
  ]
}
```

Groups match Claude's nested shape: optional string `matcher`, required
`hooks` array. `type` is `"command"` or `"prompt"`. `command` and `prompt`
are the fields for those types. `timeout` is seconds and has no quoted
range, so it is not checked.

## Events (8 names)

`PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`,
`PostCompaction`, `SessionStart`, `SessionEnd`.

`PostCompaction` is not Claude's `PostCompact`.
