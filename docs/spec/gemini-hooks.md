# Gemini CLI hooks

**Source:** https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
**Also:** https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
**Read:** 2026-09-03
**Depends on it:** `gemini.hook.unknown-event`, `gemini.hook.missing-script`,
`gemini.hook.invalid-group`, `gemini.hook.command-without-command`,
`gemini.hook.unknown-handler-type`
(`src/facts/gemini.ts`, `src/discover/hooks.ts`, `src/checks/hooks.ts`)

## Project file

Hooks live in the `hooks` object of `settings.json` — the same file the MCP
scan already opens ([gemini-mcp.md](gemini-mcp.md)). Quoted precedence, highest
to lowest:

> 1. **Project settings**: `.gemini/settings.json` in the current directory.
> 2. **User settings**: `~/.gemini/settings.json`.
> 3. **System settings**: `/etc/gemini-cli/settings.json`.
> 4. **Extensions**: Hooks defined by installed extensions.

Only the project file is read, matching the Gemini MCP scope: user settings stay
unread even under `--global` (see "Deliberately unread" below).

## The complete set — 11 names

Quoted from the hook events table:

```
SessionStart          SessionEnd            BeforeAgent
AfterAgent            BeforeModel           AfterModel
BeforeToolSelection   BeforeTool            AfterTool
PreCompress           Notification
```

These are Gemini's own names. They are **not** Claude's: `BeforeTool` is not
`PreToolUse`, `PreCompress` is not `PreCompact`, and Gemini has no `Stop`,
`UserPromptSubmit`, or `PreToolUse` at all. Never validate one set against the
other — that is the whole reason this profile exists.

## Group shape

Quoted hook definition table:

| Field        | Type      | Required | Description                             |
| ------------ | --------- | -------- | --------------------------------------- |
| `matcher`    | `string`  | No       | regex (tools) or exact string (lifecycle) |
| `sequential` | `boolean` | No       | run one after another vs in parallel     |
| `hooks`      | `array`   | **Yes**  | array of hook configurations             |

Nested groups, exactly like Claude. A group with no `hooks` array, or a
non-string `matcher`, is `gemini.hook.invalid-group`. The docs document no flat
handler array.

`sequential` is inventoried, not checked — it changes ordering, never whether a
hook runs.

## Handler shape

Quoted hook configuration table:

| Field         | Type     | Required  | Description                                      |
| ------------- | -------- | --------- | ------------------------------------------------ |
| `type`        | `string` | **Yes**   | "Currently only `"command"` is supported."        |
| `command`     | `string` | **Yes\*** | "Required when `type` is `"command"`."            |
| `name`        | `string` | No        | friendly name for logs                            |
| `timeout`     | `number` | No        | "Execution timeout in milliseconds (default: 60000)." |
| `description` | `string` | No        | brief explanation                                 |

`type` is required and the only accepted value is `"command"`. Omitting it, or
using Claude's `http` / `mcp_tool` / `prompt` / `agent`, is
`gemini.hook.unknown-handler-type`. A command handler with no `command` is
`gemini.hook.command-without-command`.

`timeout` is **milliseconds** here, not the seconds Copilot CLI uses. It is
recorded, never bounds-checked: the page states a default, not a legal range.

## Path placeholder

Quoted environment variable: `GEMINI_PROJECT_DIR` — "The absolute path to the
project root." Official example:

```json
"command": "$GEMINI_PROJECT_DIR/.gemini/hooks/security.sh"
```

`$GEMINI_PROJECT_DIR` and `${GEMINI_PROJECT_DIR}` resolve against the project
root for `gemini.hook.missing-script`. A bare relative path falls back to the
same two bases as every other profile ([hook-sources.md](hook-sources.md)).

## Deliberately unread

- `~/.gemini/settings.json` — user hooks. `--global` is not wired for Gemini on
  the MCP side either; wiring one surface and not the other would report a
  user hook as the project's problem. Same line as
  [gemini-mcp.md](gemini-mcp.md).
- `/etc/gemini-cli/settings.json` — system settings, not the project's to fix.
  Same call as Claude managed policy.
- Extension-provided hooks — outside the repository.

## Staleness risk: HIGH

The event set is new and the page says `type` supports only `"command"`
"currently", which names its own expansion. The failure mode is a false error on
a working hook. `bun run spec:check` diffs this set against the live page.

- Escape hatch for users: `ignoreRules: ["gemini.hook.unknown-event"]`
- Correct response to a reported false positive: re-read the source and update
  the set, not tell the user to ignore the rule.
