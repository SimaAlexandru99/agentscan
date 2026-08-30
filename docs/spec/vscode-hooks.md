# VS Code agent hooks

**Source:** https://code.visualstudio.com/docs/agent-customization/hooks
**Read:** 2026-08-30
**Depends on it:** `vscode.hook.unknown-event`, `vscode.hook.missing-script`

## Project files

Quoted:

> Workspace: `.github/hooks/*.json`

Official example:

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

Optional `cwd` and OS overrides (`windows` / `linux` / `osx`) are honoured
when path-checking a script. Unresolved interpolations and Windows drive or
UNC cwd values (`C:\…`, `\\server\share`) are not joined as relative POSIX
paths when the scanner is running on Linux or macOS — those existence checks
are skipped rather than inventing a folder named `C:\…` under the project.

## Events (eight)

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`,
`SubagentStart`, `SubagentStop`, `Stop`.

Do not validate these files against the Claude 33-event set.

## Staleness risk: HIGH
