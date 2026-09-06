# Kiro hooks

**Source:** https://kiro.dev/docs/hooks/
**Also:** https://kiro.dev/docs/ide/whats-new-v1/hooks/
**Read:** 2026-09-07
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

## Events (10 names)

Quoted trigger table on https://kiro.dev/docs/ide/whats-new-v1/hooks/:

```
SessionStart          Stop                  UserPromptSubmit
PreTaskExec           PostTaskExec          PreToolUse
PostToolUse           PostFileCreate        PostFileSave
PostFileDelete
```

Legacy `agentSpawn` maps to `SessionStart`; there is no v1 `AgentSpawn`
trigger. `userTriggered` has no v1 equivalent and is unread.

## Deliberately unread

- `.kiro/agents/` — the custom-agents page names fields but not a filename
  pattern.
- Legacy `.kiro.hook` files.

## Staleness risk: HIGH
