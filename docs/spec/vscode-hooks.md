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
when path-checking a script. Official docs select the OS-specific command
from the extension host platform:

```json
{
  "type": "command",
  "command": "./scripts/format.sh",
  "windows": "powershell -File scripts\\format.ps1"
}
```

A launch whose `windows` / `linux` / `osx` platform does not match
`process.platform` is still inventoried, but `scriptExists` stays unset and
`vscode.hook.missing-script` is not emitted. The scanner does not rewrite
`scripts\format.ps1` into a POSIX path and then check the host disk — that
would be a case-sensitivity false positive. Host-matching overrides and the
platform-neutral `command` stay fully checked.

Unresolved interpolations, drive-relative `C:foo`, Windows drive/UNC values
on Linux or macOS, and POSIX absolute paths on Windows skip the existence
check rather than inventing a folder under the project.

## Events (eight)

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`,
`SubagentStart`, `SubagentStop`, `Stop`.

Do not validate these files against the Claude 33-event set.

## Staleness risk: HIGH
