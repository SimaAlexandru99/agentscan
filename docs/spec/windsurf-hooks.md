# Windsurf / Cascade hooks

**Source:** https://docs.devin.ai/desktop/cascade/hooks
**Read:** 2026-09-03
**Depends on it:** `windsurf.hook.unknown-event`, `windsurf.hook.missing-script`,
`windsurf.hook.command-without-command`

Do not apply Claude's 33-event list, Grok's 14-event list, or Claude handler
types (`type: command|http|mcp_tool|prompt|agent`). Cascade hooks are a
flat `{ hooks: { <event>: [ { command, powershell } ] } }` object.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `.windsurf/hooks.json` | yes |
| User (Devin Desktop) | `~/.codeium/windsurf/hooks.json` | `--global` only |
| User (JetBrains) | `~/.codeium/hooks.json` | unread |
| System | `/etc/windsurf/hooks.json`, macOS `/Library/Application Support/Windsurf/hooks.json`, Windows `C:\ProgramData\Windsurf\hooks.json` | unread |
| Devin Local | different format | unread |

Quoted: hooks from all opened locations merge system → user → workspace.
This scanner inventories each readable file; it does not simulate merge
order as runtime.

## Events (12 names)

Quoted table on the Cascade hooks page:

`pre_read_code`, `post_read_code`, `pre_write_code`, `post_write_code`,
`pre_run_command`, `post_run_command`, `pre_mcp_tool_use`,
`post_mcp_tool_use`, `pre_user_prompt`, `post_cascade_response`,
`post_cascade_response_with_transcript`, `post_setup_worktree`.

An unrecognised name is `windsurf.hook.unknown-event`.

## Handler fields

Quoted: at least one of `command` (macOS/Linux, via `bash -c`) or
`powershell` (Windows). Neither present is `windsurf.hook.command-without-command`.

Path-check `command` on POSIX and `powershell` on Windows, with the same
conservatism as other hook script checks (skip compounds, PATH binaries,
unresolved interpolations). A POSIX file that only sets `powershell` is
not a missing script — Cascade skips it on that host.

`~` in `working_directory` is unread (docs: tilde not expanded).

## Staleness risk: HIGH
