# Copilot CLI hooks

**Source:** https://docs.github.com/en/copilot/reference/hooks-reference
**Read:** 2026-09-02
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

Quoted fields: one of `bash`, `powershell`, or `command` is required
**"unless `exec` is specified"**. `command` is the cross-platform fallback.
`cwd`, `env`, `timeoutSec` (default 30), and `timeout` (alias; `timeoutSec`
wins) are optional. `type` may be omitted and defaults to command.

### `exec` form (read 2026-09-02)

Quoted:

> In Copilot CLI, you can use `exec` and `args` to run an executable directly
> instead of using a shell

> `exec` | string | Instead of `bash`, `powershell`, and `command` | Executable
> name or path. Runs the executable directly without a shell. Only supported
> in Copilot CLI.

> `args` | array of strings | No | Arguments passed directly to `exec`.

A handler with `exec` and none of `bash` / `powershell` / `command` is
complete. `copilot.hook.command-without-command` fires only when all four are
absent. `exec` is path-checked like any other launch (`./scripts/gone.sh`
missing is `copilot.hook.missing-script`; a bare executable name is not
resolved). Before 2026-09-02 the check ignored `exec` and reported a valid
exec-form hook at severity error.

On POSIX the scanner path-checks `bash`, then `command`; a `powershell`-only
entry is inventoried and not existence-checked. On Windows the reverse.
`exec` is platform-neutral and is checked on every host.

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
"VS Code compatible format — Configure the event name in PascalCase (for
example, `SessionStart`)").

### PascalCase spellings of Copilot-only events (read 2026-09-02)

The payload reference documents these Copilot-only events with a PascalCase
configuration name as well, in the same `camelCase` / `PascalCase` headers it
uses for the VS Code-shared events:

| Copilot | PascalCase alias | Where |
|---------|------------------|-------|
| `sessionEnd` | `SessionEnd` | heading "`sessionEnd` / `SessionEnd`" |
| `postToolUseFailure` | `PostToolUseFailure` | heading "`postToolUseFailure` / `PostToolUseFailure`" |
| `errorOccurred` | `ErrorOccurred` | heading "`errorOccurred` / `ErrorOccurred`" |
| `permissionRequest` | `PermissionRequest` | note "Claude-format matchers (PascalCase `PermissionRequest`)" |

These live in `COPILOT_PASCAL_ALIASES` and are accepted **only** on
`version: 1` documents; on a native VS Code file `SessionEnd` is still
`vscode.hook.unknown-event`. Before 2026-09-02 all four fired
`copilot.hook.unknown-event` at severity error.

Not added: `Notification`. The `notification` section shows
`hook_event_name: "Notification"` in its input payload but has no
`notification` / `Notification` heading, and `userPromptTransformed` and
`subagentStart` have no PascalCase heading either. Re-read before adding any
of them.

## Staleness risk: HIGH
