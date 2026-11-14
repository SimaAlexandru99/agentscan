# Qwen Code hooks

**Source:** https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/
**Also:** https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/hooks.md
**Also:** https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/file-changed-hooks.md (FileChanged matcher detail)
**Read:** 2026-11-14
**Depends on it:** (new) — proposed `qwen.hook.*` rules. Reuse of the Gemini group parser is listed under "Gemini comparison"

## Where hooks live

Quoted:

> Hooks are configured in Qwen Code settings, typically in `.qwen/settings.json`
> or user configuration files.

The docs do not give a single explicit user-level hooks path. The user
settings file is `~/.qwen/settings.json` (see [qwen-mcp.md](qwen-mcp.md)), and the
`/hooks` browser "reloads hook definitions from the user, workspace and system
(System and SystemDefaults) settings files". Treat `~/.qwen/settings.json`
as the user location, but mark that as inferred until a rule depends on it.

Top-level key: `hooks`. Top-level switch: `disableAllHooks` (quoted: "set
`disableAllHooks` to `true` in your settings file (at the top level, alongside
`hooks`)").

Precedence within one event, quoted: "sequential hooks from settings and
extensions run in this order: Project, User, System, Extension."

Project hooks need an approval or folder trust before they run. Quoted:

> The decision is saved in `~/.qwen/hookApprovals.json` and is bound to the
> exact hooks configuration you reviewed ...

Hooks declared in project skill or subagent frontmatter need explicit folder
trust, not approval.

## Event names

The docs give 23 events. They are Claude-style, not Gemini-style. Table
(events and matcher targets, from "Hook Events" and "Matcher Patterns"):

| Event | Matcher target |
|-------|----------------|
| `PreToolUse` | tool id |
| `PostToolUse` | tool id |
| `PostToolUseFailure` | tool id |
| `PostToolBatch` | none (matcher ignored) |
| `UserPromptSubmit` | none |
| `UserPromptExpansion` | command name, without the leading `/` |
| `SessionStart` | source: `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | reason: `clear`, `logout`, `prompt_input_exit`, ... |
| `SessionDelete` | none |
| `MessageDisplay` | none |
| `Stop` | none |
| `StopFailure` | error type (`rate_limit`, `loop_detected`, ...) |
| `SubagentStart` | agent type |
| `SubagentStop` | agent type |
| `PreCompact` | trigger: `manual`, `auto` |
| `PostCompact` | trigger: `manual`, `auto` |
| `Notification` | type: `permission_prompt`, `idle_prompt`, `auth_success` |
| `PermissionRequest` | tool id |
| `PermissionDenied` | tool id |
| `TodoCreated` | none |
| `TodoCompleted` | none |
| `InstructionsLoaded` | file path of the loaded context file |
| `FileChanged` | basename of the changed file |

Quoted note on subagents: "Use `SubagentStop` for agent completion; `Stop` is
not automatically remapped."

## Group shape

Quoted example:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file",
        "hooks": [
          {
            "type": "command",
            "command": "\"$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh\"",
            "name": "security-check",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Each event maps to an array of groups. A group has an optional `matcher` string
and a `hooks` array of handlers. Matcher rules, quoted:

> Empty string `""`, `"*"` or `".*"` matches all events of that type

Otherwise the matcher is "an unanchored regular expression" (quoted). A
`|`-list that does not start with `^` or `(` is an exact-match list. Tool hooks
also accept Claude aliases such as `"Bash"` and `"Write|Edit"`.

## Handler shape

Quoted "Command Hooks" table, `type` = `"command"`:

| Field | Type | Required | Description (quoted or paraphrased) |
|-------|------|----------|-------------------------------------|
| `type` | `"command"` | Yes | Hook type |
| `command` | string | Yes | Command to execute |
| `name` | string | No | Hook name (for logging) |
| `description` | string | No | Hook description |
| `timeout` | number | No | "Timeout in seconds, default 60" |
| `async` | boolean | No | "Whether to run asynchronously in background" |
| `env` | object | No | Environment variables |
| `shell` | `"bash"` or `"powershell"` | No | Shell to use |
| `statusMessage` | string | No | Shown during execution |

Other handler types in the docs:

- `http`: `url` (required), `headers`, `allowedEnvVars`, `timeout` (seconds,
  default 600), `name`, `statusMessage`, `once`. Redirects are never followed.
  Private-network targets are blocked unless `security.allowPrivateNetworkHooks`
  is set in user, system or system-default settings.
- `prompt`: an LLM evaluates the event input. The input is injected at
  `$ARGUMENTS`. Its `model` and `timeout` (seconds) fields also appear in the
  docs example. The docs warn that the input goes to the model provider.
- `function`: "used internally by the Skill system and are not currently exposed
  as a public API". Do not validate it as a user type.

Command timeouts have a legacy rule, quoted: "for command hooks a value of
`1000` or more is still read as milliseconds". A non-positive or non-numeric
timeout is ignored and the 60-second default applies.

## Environment variables

Quoted:

> `QWEN_PROJECT_DIR`, `CLAUDE_PROJECT_DIR` and `GEMINI_PROJECT_DIR` are set to
> the project directory in the environment of every command hook.

The canonical name is `QWEN_PROJECT_DIR`. The other two are documented aliases.
Quoting rule, quoted: "double-quote them like any other shell variable".

## Gemini comparison

Compared with [gemini-hooks.md](gemini-hooks.md) (read 2026-09-03). Gemini's
file is also `.gemini/settings.json` and also nests `{matcher, hooks[]}` groups.

**Same, so the Gemini group parser can be reused:**

- Top-level `hooks` object in `settings.json`, event name keys, arrays of groups.
- Group fields `matcher` (string) and `hooks` (array). A group whose `hooks`
  is not an array is invalid. The Qwen docs show this shape but do not say
  "required" in a table, so see Unverified.
- Handler `type` and `command` are the core fields, and `command` is required
  when `type` is `"command"`.
- Handler fields `name` and `description`.
- Placeholder `$GEMINI_PROJECT_DIR` resolves against the project root, because
  Qwen sets that variable too.

**Differs. Do not reuse the Gemini behavior here:**

1. **Event set.** Gemini has 11 events: `BeforeTool`, `AfterTool`, `BeforeAgent`,
   `AfterAgent`, `BeforeModel`, `AfterModel`, `BeforeToolSelection`,
   `PreCompress`, plus `SessionStart`, `SessionEnd` and `Notification`. Qwen has
   23 events. Only `SessionStart`, `SessionEnd` and `Notification` are shared.
   Qwen has `PreToolUse` and `PostToolUse`, not `BeforeTool` and `AfterTool`.
   Qwen has `PreCompact`, not `PreCompress`. The Gemini `unknown-event` set
   would wrongly flag most of a valid Qwen config.
2. **Handler types.** Gemini accepts only `command`. Qwen accepts `command`,
   `http` and `prompt`, and documents `function` as internal. The Gemini
   `unknown-handler-type` check, which lists Claude's `http` / `prompt` / `agent`
   as unknown, is wrong for Qwen.
3. **Timeout unit.** Gemini: milliseconds, default 60000. Qwen: seconds for
   command, http and prompt, default 60, with the legacy `>= 1000 means ms`
   reading. Do not copy the Gemini "recorded, never bounds-checked" rule without
   the Qwen unit rule above.
4. **`sequential` field.** Gemini's group has `sequential`. The Qwen docs name
   no such field. Ordering is by source (Project, User, System, Extension).
5. **Matcher.** Gemini: regex for tool events, exact string for lifecycle events.
   Qwen: regex for every event that declares a matcher target. Events without
   a target (`Stop`, `UserPromptSubmit`, ...) ignore the matcher.
6. **Extra handler fields.** `async`, `env`, `shell`, `statusMessage` (command);
   `url`, `headers`, `allowedEnvVars`, `once` (http). None are in the Gemini
   capture.
7. **Approval gate.** Project hooks do not run until approved or folder-trusted.
   Nothing equivalent is in the Gemini capture. A finding "hook present" on a
   project file is not the same as "hook runs" for Qwen.
8. **Agent-frontmatter hooks.** Qwen allows hooks inside a subagent or skill
   frontmatter. The Gemini capture has none.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `<project>/.qwen/settings.json` (`hooks`, `disableAllHooks`) | planned: yes |
| User | `~/.qwen/settings.json` (`hooks`) | planned: yes, same caveat as MCP |
| Approvals | `~/.qwen/hookApprovals.json` | no, read-only state; never edit |
| Hook scripts | path named in `command` | only for existence checks, as with Gemini |
| Not opened | System `/etc/qwen-code/settings.json` and platform equivalents | no |

## Unverified

- Whether the inner `hooks` array of a group is required. The example shows it.
  No table marks it required.
- Whether `timeout` accepts values below 1 or above a maximum. The docs state the
  default and the `>= 1000` legacy rule only.
- Whether a user-level hooks location other than `~/.qwen/settings.json` exists.
  The docs say "user configuration files" without a path.
- Exit-code semantics for command hooks. The docs describe stdin JSON and stdout
  output, but the exit-code table was not read in full in this pass.
- Whether `$QWEN_PROJECT_DIR` substitution differs by shell beyond the quoting
  rule quoted above.

## Staleness risk: HIGH

The events page changes with almost every Qwen release. It has added events
since mid-2026 (`PostToolBatch`, `TodoCreated`, `FileChanged`,
`PermissionDenied`). Re-read and diff the event set before any hook rule is
changed.
