# Hook events

**Source:** https://code.claude.com/docs/en/hooks
**Read:** 2026-08-09
**Depends on it:** `hook.unknown-event` (`src/checks/index.ts`, `KNOWN_HOOK_EVENTS`)

## The complete set — 31 names

```
SessionStart          Setup                 UserPromptSubmit
UserPromptExpansion   PreToolUse            PermissionRequest
PermissionDenied      PostToolUse           PostToolUseFailure
PostToolBatch         Notification          MessageDisplay
SubagentStart         SubagentStop          TaskCreated
TaskCompleted         Stop                  StopFailure
TeammateIdle          InstructionsLoaded    ConfigChange
CwdChanged            DirectoryAdded        FileChanged
WorktreeCreate        WorktreeRemove        PreCompact
PostCompact           Elicitation           ElicitationResult
SessionEnd
```

Cadence, per the docs: once per session (`SessionStart`, `SessionEnd`), once per
turn (`UserPromptSubmit`, `Stop`, `StopFailure`, `PostToolBatch`), and per tool
call inside the agentic loop (`PreToolUse`, `PostToolUse`). The rest fire on
specific conditions — config changes, compaction, subagents, MCP interactions.

`PostToolBatch`: "After a full batch of parallel tool calls resolves, before the
next model call."

## Why this file exists

This list was originally nine names, inferred from what appeared in real
projects. It reported `PostToolBatch` — a documented event — as a dead hook at
**severity error** on a real project, and would have done the same for `Setup`,
`PostToolUseFailure`, `StopFailure`, `SubagentStart`, `FileChanged`,
`ConfigChange` and sixteen others.

## Staleness risk: HIGH

This is the single most likely thing here to go out of date, and the failure
mode is a false error on a working hook. Upstream adds events without notice.

- Escape hatch for users: `ignoreRules: ["hook.unknown-event"]`
- Correct response to a report of a false positive: re-read the source above and
  update the set, not tell the user to ignore the rule.
