# VS Code agent hooks

**Source:** https://code.visualstudio.com/docs/agent-customization/hooks
**Read:** 2026-08-31
**Depends on it:** `vscode.hook.unknown-event`, `vscode.hook.missing-script`,
`vscode.hook.command-without-command`, `vscode.hook.unknown-handler-type`

Copilot CLI `version: 1` files that also live under `.github/hooks` are
documented in [copilot-hooks.md](copilot-hooks.md), not here.

## Project files

Quoted:

> Workspace: `.github/hooks/*.json`

Official example (no `version` field):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "npx prettier --write ."
      }
    ]
  }
}
```

Each handler must specify `type: "command"` and a command. This is a flat
array of handlers, not Claude's matcher-group wrapper (though Claude-format
settings files are also loaded from `.claude/settings.json`).

Quoted command properties: `cwd`, `env`, `timeout`, and OS-specific overrides
(`windows` / `linux` / `osx`). Official docs select the OS-specific command
from the extension host platform.

A launch whose `windows` / `linux` / `osx` platform does not match
`process.platform` is still inventoried, but `scriptExists` stays unset and
`vscode.hook.missing-script` is not emitted.

Unresolved interpolations, drive-relative `C:foo`, Windows drive/UNC values
on Linux or macOS, and POSIX absolute paths on Windows skip the existence
check rather than inventing a folder under the project.

## Events (eight)

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`,
`SubagentStart`, `SubagentStop`, `Stop`.

Do not validate these files against the Claude 33-event set, and do not
accept Copilot camelCase names (`sessionStart`) unless the file is Copilot
CLI (`version: 1`).

## User location

Quoted user scope: `~/.copilot/hooks`, `~/.claude/settings.json`.
`~/.copilot/hooks` is scanned only under `--global`. Files there with
`version: 1` are Copilot CLI; files without it stay native VS Code.
`~/.claude/settings.json` stays unread (Claude user settings).

Quoted: workspace hooks take precedence over user hooks for the same event.

## Staleness risk: HIGH
