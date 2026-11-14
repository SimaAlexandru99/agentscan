# Windsurf / Cascade hooks

**Source:** https://docs.devin.ai/desktop/cascade/hooks (redirects to
https://docs.devin.ai/desktop/devin-local/customizations; no Cascade hooks page
is served any more)
**Read:** 2026-11-14

**Re-read:** 2026-11-14. The 12-name Cascade event table is no longer
documented on any of the 211 live docs.devin.ai pages checked. Only
`post_setup_worktree` survives, on
https://docs.devin.ai/desktop/cascade.md (legacy Cascade page), with the
example config in `.windsurf/hooks.json`. Its changelog history shows
`post_cascade_response`, `post_write_code` and
`POST_CASCADE_RESPONSE_WITH_TRANSCRIPT` existed, but those entries are not
current docs. The Devin CLI hooks overview does not document this snake_case
file or `.windsurf/hooks.json`. Those paths stay this legacy Cascade contract,
now unverified for all but `post_setup_worktree`. Current Devin CLI hooks are
[devin-hooks.md](devin-hooks.md). Devin Desktop migrates Windsurf hooks into
Devin hooks (changelog, 2026-07-17 and 2026-07-29).
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
| System | CHANGED-MEANING 2026-11-14: `/etc/devin/hooks.json`, macOS `/Library/Application Support/Devin/hooks.json`, Windows `C:\ProgramData\Devin\hooks.json`; the legacy `/etc/windsurf/hooks.json`, `…/Windsurf/hooks.json`, `C:\ProgramData\Windsurf\hooks.json` are a per-file fallback only when the Devin file is missing (https://docs.devin.ai/desktop/controls.md) | unread |
| Devin Local | `.devin/hooks.v1.json` (Devin CLI format, see [devin-hooks.md](devin-hooks.md)) | unread here; the CLI reader covers it |

Quoted (legacy, not re-found on 2026-11-14 pages): hooks from all opened
locations merge system → user → workspace. This scanner inventories each
readable file; it does not simulate merge order as runtime.

## Events (12 names)

CHANGED-MEANING (2026-11-14): the quoted 12-name table is gone from the live
docs. Only `post_setup_worktree` is still documented, quoted from the legacy
Cascade page:

> The `post_setup_worktree` hook runs after each worktree is created and
> configured. It is executed inside the new **worktree** directory.

The other 11 names (`pre_read_code` … `post_cascade_response_with_transcript`)
are not documented in the current docs. `windsurf.hook.unknown-event` would
flag names the vendor no longer documents, so it is not a settled vendor fact.
Rules affected: `windsurf.hook.unknown-event`, `windsurf.hook.missing-script`,
`windsurf.hook.command-without-command`.

An unrecognised name is `windsurf.hook.unknown-event`.

## Handler fields

CHANGED-MEANING (2026-11-14): the live legacy example uses `command` with
`show_output`; `powershell` is not documented in any of the 211 live pages.
The `command` field is quoted (`"command": "bash $ROOT_WORKSPACE_PATH/hooks/setup_worktree.sh"`).
Rules affected: `windsurf.hook.command-without-command` (still fires when neither
field is present, but the `powershell` alternative is unverified).

Path-check `command` on POSIX and `powershell` on Windows, with the same
conservatism as other hook script checks (skip compounds, PATH binaries,
unresolved interpolations). A POSIX file that only sets `powershell` is
not a missing script — Cascade skips it on that host.

`~` in `working_directory` is unread (docs: tilde not expanded).

## Staleness risk: HIGH
