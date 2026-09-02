# Hook events

**Source:** https://code.claude.com/docs/en/hooks
**Read:** 2026-09-02 (all 33 names, the required `type` enum, per-type required
fields, and the three compatibility tiers re-read and unchanged)
**Depends on it:** `claude.hook.unknown-event`, `claude.hook.unknown-handler-type`,
`claude.hook.command-without-command`, `claude.hook.http-without-url`,
`claude.hook.mcp-tool-without-server-or-tool`, `claude.hook.prompt-without-prompt`,
`claude.hook.incompatible-handler`
(`src/facts/hook-schema.ts`, `src/discover/hooks.ts`, `src/checks/hooks.ts`)

## The complete set — 33 names

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
SessionEnd            PreModelSwitch        PostModelSwitch
```

Cadence, per the docs: once per session (`SessionStart`, `SessionEnd`), once per
turn (`UserPromptSubmit`, `Stop`, `StopFailure`, `PostToolBatch`), and per tool
call inside the agentic loop (`PreToolUse`, `PostToolUse`). The rest fire on
specific conditions — config changes, compaction, subagents, MCP interactions.

## Handler schema (2026-08-31)

Quoted common field: `type` is **required** and is `"command"`, `"http"`,
`"mcp_tool"`, `"prompt"`, or `"agent"`. Do **not** infer `type` from the
presence of `command` or `url`. Omitting `type`, or using any other value, is
`claude.hook.unknown-handler-type`.

Quoted command field: when `type` is `"command"`, `command` is required
(`claude.hook.command-without-command`).

Command hooks also accept optional `args` (read 2026-09-02): "When present,
`command` is resolved as an executable and spawned directly with `args` as the
argument vector, with no shell involved." The scanner already walks
`[command, ...args]` for the script operand, so
`{ "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/format.js"] }`
path-checks the script in a plugin and `command: "node"` alone is never a path.

Quoted HTTP field: when `type` is `"http"`, `url` is required
(`claude.hook.http-without-url`).

Quoted MCP tool fields: `server` and `tool` are required. Do not accept
`name` / `toolName` as substitutes.

Quoted prompt and agent fields: `prompt` is required.

Official examples nest matcher groups: `{ "matcher": "...", "hooks": [ ... ] }`.
The 2026-08-31 page does not document a flat handler array. Flat arrays are
`claude.hook.invalid-group`.

## Event / handler compatibility

Quoted:

> Events that support all five hook types (`command`, `http`, `mcp_tool`,
> `prompt`, and `agent`): PermissionDenied, PermissionRequest, PostToolBatch,
> PostToolUse, PostToolUseFailure, PreToolUse, Stop, SubagentStop,
> TaskCompleted, TaskCreated, TeammateIdle, UserPromptExpansion,
> UserPromptSubmit.

> Events that support `command`, `http`, and `mcp_tool` hooks but not `prompt`
> or `agent`: ConfigChange, CwdChanged, DirectoryAdded, Elicitation,
> ElicitationResult, FileChanged, InstructionsLoaded, MessageDisplay,
> Notification, PostCompact, PostModelSwitch, PreCompact, PreModelSwitch,
> SessionEnd, StopFailure, SubagentStart, WorktreeCreate, WorktreeRemove.

> `SessionStart` and `Setup` support `command` and `mcp_tool` hooks. They don't
> support `http`, `prompt`, or `agent` hooks.

## Why this file exists

This list was originally nine names, inferred from what appeared in real
projects. It reported `PostToolBatch` — a documented event — as a dead hook at
**severity error** on a real project, and would have done the same for `Setup`,
`PostToolUseFailure`, `StopFailure`, `SubagentStart`, `FileChanged`,
`ConfigChange` and sixteen others.

## Reviewed and rejected

- **`TaskCreate`** — appears on the page as "`TaskCreated` | When a task is being
  created via `TaskCreate`". It is a tool name; the event is `TaskCreated`.
  Recorded in `scripts/spec-drift.ts` so it is not re-adjudicated.
- **`TaskUpdate`** — mentioned as the tool that can trigger `TaskCompleted`.
  Not an event. Recorded in `scripts/spec-drift.ts`.

## Staleness risk: HIGH

This is the single most likely thing here to go out of date, and the failure
mode is a false error on a working hook. Upstream adds events without notice.

- Escape hatch for users: `ignoreRules: ["hook.unknown-event"]`
- Correct response to a report of a false positive: re-read the source above and
  update the set, not tell the user to ignore the rule.
- `bun run spec:check` diffs this set against the live page. Run it at release
  time; it makes network calls and must never be wired into `check`.
