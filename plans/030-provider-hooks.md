# Plan 030: Hook events and handlers per provider

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/checks/hooks.ts src/discover/hooks.ts docs/spec/hook-events.md`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/029-multi-provider-agents.md
- **Category**: direction
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

`KNOWN_HOOK_EVENTS` is the Claude set of 31 names, applied to every `HookFact`.
A valid Codex or VS Code event would be reported as dead. Claude also has
handler types besides `command` (`http`, `mcp_tool`, `prompt`, `agent`);
`missing-script` must apply only to command handlers, including command arrays.

## Spec captures (do first)

- https://code.claude.com/docs/en/hooks (re-verify 31 events + handler types)
- Codex `.codex/hooks.json` official page
- https://code.visualstudio.com/docs (Copilot hooks / `.github/hooks`)
- Cursor / Grok / Antigravity hook pages if they exist

STOP per missing page. Do not copy Claude events onto other providers.

## Scope

**In scope**: hook discovery per path, `HookFact.sourceProvider`, `handlerType`, event-set maps, namespaced checks (`claude.hook.*` already; add `codex.hook.unknown-event`, `vscode.hook.unknown-event`, …), `spec:check` extension for additional event lists when a stable page exists, tests.

**Out of scope**: marketplace `~/.claude/plugins` (still outside the project).

## Steps

1. Capture event lists as `docs/spec/<provider>-hook-events.md`.
2. Claude: record handler types; extract script only from `type: command` (string or argv). HTTP/MCP/prompt/agent handlers never emit `claude.hook.missing-script`.
3. Codex / VS Code: discover documented files; validate against **their** sets only.
4. `spec:check`: optional extra fetch per captured URL; keep over-report discipline and a `REVIEWED_NOT_EVENTS` per provider.
5. Tests: Claude `PostToolBatch` still known; a Codex-only event name in `.codex/hooks.json` is not `claude.hook.unknown-event`; command array `["node", "hook.js"]` missing file still errors; `type: http` with no script does not.

## Done criteria

- [ ] Unknown-event checks are per provider
- [ ] Non-command Claude handlers do not get missing-script
- [ ] Gates green; `spec:check` still exit 0

## STOP conditions

- Merging all events into one set.
- Treating an undocumented filename as a hook source.

## Maintenance notes

Hook event lists go stale (this already happened once). Prefer `spec:check` coverage for every list you hardcode.
