# Kiro hooks

**Source:** https://kiro.dev/docs/hooks/
**Also:** https://kiro.dev/docs/ide/whats-new-v1/hooks/
**Read:** 2026-09-07
**Re-read:** 2026-11-12 (https://kiro.dev/docs/hooks/types/ and
https://kiro.dev/docs/cli/v3/hooks-migration/). The types page quotes
`SessionEnd`, `PreCompact`, and `PostCompact`. Its availability table still
lists Pre Task Execution and Post Task Execution and does not quote a
replacement JSON token, so `PreTaskExec` and `PostTaskExec` stay.
**Depends on it:** `kiro.hook.unknown-event`, `kiro.hook.missing-script`,
`kiro.hook.command-without-command`, `kiro.hook.prompt-without-prompt`,
`kiro.hook.unknown-handler-type`, `kiro.hook.invalid-group`
(`src/facts/kiro.ts`, `src/discover/kiro.ts`, `src/checks/hooks.ts`)

Do not apply Claude's 33-event list. Overlap (`PreToolUse`, `Stop`,
`UserPromptSubmit`, `SessionStart`) is coincidental; Kiro files are
standalone JSON, not a Claude `hooks` object keyed by event name.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `.kiro/hooks/*.json` | yes |
| User | `~/.kiro/hooks/` | `--global` only |

Quoted (hooks page): each file is `.kiro/hooks/<id>.json`. Quoted (IDE 1.0
page): global hooks in `~/.kiro/hooks/`.

## Shape

Quoted:

> `version` — Yes — currently `"v1"`
> `hooks` — Yes — Array of hook definitions
> `hooks[].trigger` — Yes — PascalCase
> `hooks[].action.type` — Yes — `"command"` or `"agent"`
> `hooks[].action.command` — Cond. — required when type is `"command"`
> `hooks[].action.prompt` — Cond. — required when type is `"agent"`

Missing `version: "v1"` or a `hooks` array is `kiro.hook.invalid-group`.

## Events (13 names)

Quoted trigger table on https://kiro.dev/docs/ide/whats-new-v1/hooks/, plus
the three tokens quoted on the types page (re-read 2026-11-12):

```
SessionStart          SessionEnd            Stop
UserPromptSubmit      PreCompact            PostCompact
PreTaskExec           PostTaskExec          PreToolUse
PostToolUse           PostFileCreate        PostFileSave
PostFileDelete
```

Legacy `agentSpawn` maps to `SessionStart`; there is no v1 `AgentSpawn`
trigger. `userTriggered` has no v1 equivalent and is unread.

## Deliberately unread

- `.kiro/agents/*.json` and `*.md` are agents, not hooks. See
  [kiro-agents.md](kiro-agents.md).
- Legacy `.kiro.hook` files.

## Staleness risk: HIGH
