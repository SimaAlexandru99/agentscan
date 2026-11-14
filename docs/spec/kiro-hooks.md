# Kiro hooks

**Source:** https://kiro.dev/docs/hooks/
**Also:** https://kiro.dev/docs/ide/whats-new-v1/hooks/
**Read:** 2026-11-14
**Re-read:** 2026-11-14 (https://kiro.dev/docs/hooks/types/ and
https://kiro.dev/docs/cli/v3/hooks-migration/, updated November 6, 2026). The
types page quotes `SessionEnd`, `PreCompact`, and `PostCompact`. Its
availability table still lists Pre Task Execution and Post Task Execution and
does not quote a replacement JSON token, so `PreTaskExec` and `PostTaskExec`
stay. The 2026-11-14 IDE 1.0 trigger table still quotes them.
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

CHANGED-MEANING (2026-11-14, hooks page): `hooks[].name` is now listed as
**Required: Yes** ("Human-readable identifier for the hook"). The earlier
quote omitted it. No kiro rule reads `name` (checked in `src/facts/kiro.ts`,
`src/discover/kiro.ts`, `src/checks/hooks.ts`), so a missing `name` is not a
current finding. Also new: optional `hooks[].timeout` (default 60),
`hooks[].enabled`, and `hooks[].confirm`. None of them is a rule.

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

Legacy `agentSpawn` maps to `SessionStart`. CHANGED-MEANING (2026-11-14):
the hook-types page now lists "Agent Spawn | — | 2.x / V3 alias", and says CLI
V3 "accepts AgentSpawn and agentSpawn as compatibility spellings". So a V3 CLI
file with `AgentSpawn` is not an unknown event. Rules affected:
`kiro.hook.unknown-event` (scanner should accept `AgentSpawn` for CLI V3, or
the rule needs a surface qualifier). `userTriggered` has no v1 equivalent and
is unread.

Also on the 2026-11-14 pages: CLI V3 "lists" a Manual trigger but `/hooks`
provides no action to invoke it, and manual hooks cannot be created in the v1
schema. The 13 names above do not change.

## Deliberately unread

- `.kiro/agents/*.json` and `*.md` are agents, not hooks. See
  [kiro-agents.md](kiro-agents.md).
- Legacy `.kiro.hook` files.

## Staleness risk: HIGH
