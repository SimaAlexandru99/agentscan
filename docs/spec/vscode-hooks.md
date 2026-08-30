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

## Events (eight)

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`,
`SubagentStart`, `SubagentStop`, `Stop`.

Do not validate these files against the Claude 33-event set.

## Staleness risk: HIGH
