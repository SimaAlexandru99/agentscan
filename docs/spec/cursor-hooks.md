# Cursor hooks

**Source:** https://cursor.com/docs/hooks
**Also:** https://cursor.com/docs/reference/third-party-hooks
**Read:** 2026-11-14
**Re-read:** 2026-09-07
**Depends on it:** `cursor.hook.unknown-event`, `cursor.hook.missing-script`,
`cursor.hook.command-without-command`, `cursor.hook.unknown-handler-type`
(`src/facts/cursor.ts`, `src/discover/cursor.ts`, `src/checks/hooks.ts`)

## Project file

Quoted:

> Project (Project-specific): `<project-root>/.cursor/hooks.json`
> Project hooks run in any trusted workspace and are checked into version
> control with your project

Quoted priority, highest to lowest: Enterprise → Team → Project → User →
Claude files (third-party import). This tool reads project
`.cursor/hooks.json` always, and `~/.cursor/hooks.json` under `--global`.
MDM and dashboard team hooks stay unread. Claude settings files stay on
the Claude profile ([copilot-hooks.md](copilot-hooks.md) records the same
choice for Copilot). User-file scripts resolve against the scanned project
root, matching Claude user hooks.

## The complete set — 21 names

Quoted, split by the three families the page names.

**Agent hooks** — "apply to Agent Chat operations" (2026-11-14: the earlier
"Cmd+K and" wording is gone from the page; see the CHANGED-MEANING note in the
report, not yet acted on):

```
sessionStart          sessionEnd            preToolUse
postToolUse           postToolUseFailure    subagentStart
subagentStop          beforeShellExecution  afterShellExecution
beforeMCPExecution    afterMCPExecution     beforeReadFile
afterFileEdit         beforeSubmitPrompt    preCompact
stop                  afterAgentResponse    afterAgentThought
```

**Tab hooks** — "apply specifically to inline Tab completions":

```
beforeTabFileRead     afterTabFileEdit
```

**App lifecycle hook** — "fires when a workspace opens and on workspace folder
changes, independent of any agent session":

```
workspaceOpen
```

camelCase, and Cursor's own vocabulary. `preToolUse` is not Claude's
`PreToolUse`; `stop` is not `Stop`. The Copilot CLI PascalCase aliasing does
**not** apply here — the page documents no PascalCase spelling.

Note `beforeMCPExecution` and `postToolUseFailure` appear only in the prose
list of agent hooks, not in the configuration example. They are events.

## Document shape

Flat arrays, not Claude's nested `{ matcher, hooks: [...] }` groups. Quoted:

> The `hooks` object maps hook names to arrays of hook definitions.

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [{ "command": "./hooks/validate-tool.sh", "matcher": "Shell" }],
    "stop": [{ "command": "./audit.sh", "loop_limit": 10 }]
  }
}
```

Quoted global option (2026-11-14): `version`, number, "required" — "Config
schema version. Must be a positive integer (use 1)." Inventoried, not checked.
Before 2026-11-14 the page listed a default of `1` and no rejected value.

## Handler shape

Quoted per-script options:

| Option       | Type                     | Default          | Description                              |
| ------------ | ------------------------ | ---------------- | ---------------------------------------- |
| `command`    | `string`                 | **required**     | "Script path or command"                 |
| `type`       | `"command" \| "prompt"` | `"command"`      | "Hook execution type"                    |
| `timeout`    | `number`                 | platform default | "Execution timeout in seconds"           |
| `loop_limit` | `number \| null`        | `5`              | "Per-script loop limit for stop/subagentStop hooks." |
| `failClosed` | `boolean`                | `false`          | "When true, hook failures (crash, timeout, non-zero exit code, no output) block the action instead of allowing it through." |
| `matcher`    | `string`                 | —                | "Regex that filters when the hook runs. An empty string or \"*\" matches everything." |

`command` is required for **every** entry, including `type: "prompt"` — the
table marks it required with no per-type exception, and documents no separate
`prompt` field. An entry with no `command` is
`cursor.hook.command-without-command`.

`type` is **optional** here, unlike Claude and Gemini: the default is
`"command"`. Only a `type` that is present and is neither `"command"` nor
`"prompt"` is `cursor.hook.unknown-handler-type`. Never emit the Claude
"required `type`" rule against this file.

Until 2026-11-14 the options table typed `matcher` as `object`, which
contradicted every documented example (`"Shell"`, `"explore|shell"`,
`"curl|wget|nc "`), so `matcher` was not shape-checked. The live table now
types it `string`. The contradiction is gone, but the shape check is not added
here: that is a decision for the owner.

`timeout` is **seconds** here, against Gemini's milliseconds.

## Script paths

Quoted:

> Project hooks (`.cursor/hooks.json` in a repository): Run from the project root

and:

> For project hooks, use paths like `.cursor/hooks/script.sh` (relative to
> project root), not `./hooks/script.sh` (which would look for
> `<project>/hooks/script.sh`).

So a relative path in a project file resolves against the project root, and the
quoted counter-example is exactly the mistake `cursor.hook.missing-script`
catches: `./hooks/script.sh` really does resolve to `<project>/hooks/script.sh`
and really is missing when the script sits in `.cursor/hooks/`.

The user file's `~/.cursor/` working directory does not apply, because the user
file is not read.

## Deliberately unread

- `~/.cursor/hooks.json` — user hooks. Cursor's other user/global paths are
  unread for the same reason; a user hook is not the project's to fix.
- `/Library/Application Support/Cursor/hooks.json`,
  `/etc/cursor/hooks.json`, `C:\ProgramData\Cursor\hooks.json` — MDM-managed,
  organization-wide. Same call as Claude managed policy.
- Team hooks synced from the web dashboard — never on disk in the repository.

## Staleness risk: HIGH

Twenty-one event names on a page that has grown twice, and the failure mode is a
false error on a working guard hook. `bun run spec:check` diffs this set against
the live page.

- Escape hatch for users: `ignoreRules: ["cursor.hook.unknown-event"]`
- Correct response to a reported false positive: re-read the source and update
  the set, not tell the user to ignore the rule.
