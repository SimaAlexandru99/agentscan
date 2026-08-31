# Copilot CLI hooks

**Source:** https://docs.github.com/en/copilot/reference/hooks-reference
**Read:** 2026-08-31
**Depends on it:** `copilot.hook.*`, `.github/hooks` `version: 1` detection
(`src/facts/hook-schema.ts`, `src/discover/hooks.ts`)

This is **not** the native VS Code hooks page. Native VS Code files omit
`version` and are command-only with eight PascalCase events; see
[vscode-hooks.md](vscode-hooks.md). Applying VS Code command-only assumptions
to a Copilot CLI `version: 1` file is a false positive.

## Detection

Quoted:

> Hook configuration files use JSON format with version `1`.

A `.github/hooks/*.json` (or `~/.copilot/hooks/*.json` under `--global`)
document is Copilot CLI **only** when `version` is the number `1`.
camelCase event names without `version: 1` stay native VS Code and fire
`vscode.hook.unknown-event`.

## Project, user, and policy locations

Quoted (Copilot CLI sources, combined; same event from every source runs):

- Policy: `/etc/github-copilot/policy.d/*.json` (Linux/macOS) or
  `C:\ProgramData\GitHub\Copilot\policy.d\*.json` (Windows). Unread —
  machine-wide admin files, not project config.
- User: `~/.copilot/hooks/*.json` (or `$COPILOT_HOME/hooks/`). Scanned only
  under `--global`. VS Code also lists this directory as its user location;
  files without `version: 1` are parsed as native VS Code.
- Project: `.github/hooks/*.json`.
- Inline `hooks` in `.github/copilot/settings.json`,
  `.github/copilot/settings.local.json`, `.claude/settings.json`, and
  `~/.copilot/settings.json`. Unread as Copilot inline config — Claude
  settings hooks use the Claude profile; Copilot settings files are not a
  captured project schema here.
- Plugin `hooks.json`. Unread.

Cloud agent loads only `.github/hooks/*.json` from the cloned repository.

## Command handlers

Quoted fields: one of `bash`, `powershell`, or `command` is required.
`command` is the cross-platform fallback. `cwd`, `env`, `timeoutSec`
(default 30), and `timeout` (alias; `timeoutSec` wins) are optional.
`type` may be omitted and defaults to command.

On POSIX the scanner path-checks `bash`, then `command`; a `powershell`-only
entry is inventoried and not existence-checked. On Windows the reverse.

## Other handler types

- `type: "http"` requires `url`.
- `type: "prompt"` requires `prompt` and is only supported on `sessionStart`
  (or PascalCase `SessionStart`).

## Events

camelCase names map onto the VS Code set where the docs say they are
compatible:

| Copilot | VS Code |
|---------|---------|
| `sessionStart` | `SessionStart` |
| `userPromptSubmitted` | `UserPromptSubmit` |
| `preToolUse` | `PreToolUse` |
| `postToolUse` | `PostToolUse` |
| `preCompact` | `PreCompact` |
| `subagentStart` | `SubagentStart` |
| `subagentStop` | `SubagentStop` |
| `agentStop` | `Stop` |

Copilot-only (never valid on a native VS Code file): `sessionEnd`,
`errorOccurred`, `notification`, `permissionRequest`,
`postToolUseFailure`, `userPromptTransformed`.

PascalCase VS Code names are also accepted in a `version: 1` file (quoted:
"VS Code compatible format").

## Staleness risk: HIGH
