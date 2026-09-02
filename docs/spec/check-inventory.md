# Check inventory — 2026-09-02 re-verification

**Read:** 2026-09-02
**Scope:** every one of the 99 ids in `src/checks/registry.ts`, re-read against
the official page each one cites. This file is the audit record; the per-page
captures next to it hold the quoted lines.

Method: for each check, open the source page listed in the capture, find the
sentence the check enforces, and compare it to what the code does. A check
**holds** when the page still says what the capture says and the code does
that. A check is **corrected** when the page documents a valid shape the code
reported as broken — the false-positive class this repository exists to avoid.
Nothing here was checked against what appears in real projects.

Context7 was the intended first stop; its monthly quota was exhausted on the
day, so every page was fetched directly from the vendor (curl / fetch, no
mirrors). The Agent Skills reference validator source was read from GitHub.

## Result

| Verdict | Count |
|---------|-------|
| Holds | 93 |
| Corrected (false positive on a documented, working config) | 6 ids, 7 corrections |
| Removed / downgraded | 0 |

The seven corrections (two on `commandcode.mcp.invalid-transport`), with the
published line each rests on, are in [Corrections](#corrections). Regression
tests: `tests/unit/spec-reverify-2026-09.test.ts`.

**Added after this audit, same day:** PR #13 merged three Windsurf Cascade
hook checks (`windsurf.hook.unknown-event`, `windsurf.hook.missing-script`,
`windsurf.hook.command-without-command`; [windsurf-hooks.md](windsurf-hooks.md))
and the `.windsurf/skills` surface ([windsurf-skills.md](windsurf-skills.md)),
bringing the registry to 102. They are not in the tables below. At merge time
both source pages were re-read: the 12 snake_case events match the page, and
"At least one of `command` or `powershell` must be specified" is quoted
verbatim. Their content hashes are in `scripts/spec-hashes.json`.

**Added in plan 039:** `mcp.literal-credential` (security; headers / auth
literals) and Copilot CLI inline settings discovery (existing
`copilot.hook.*` ids). Registry becomes 103.

## Inventory

Severity is what the check emits; provenance is the registry label. Source is
the page re-read on 2026-09-02.

### Scanner limits and unreadable input

| id | sev | provenance | source | verdict |
|----|-----|------------|--------|---------|
| `config.unreadable` | error | internal-consistency | n/a (parser result) | holds |
| `scan.truncated` | info | internal-consistency | n/a (scan cap) | holds |

### Claude Code hooks — [hook-events.md](hook-events.md), [hook-sources.md](hook-sources.md)

Source: https://code.claude.com/docs/en/hooks

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `claude.hook.unknown-event` | error | spec-required | holds | 33 names in the event table; matches `KNOWN_HOOK_EVENTS` exactly |
| `claude.hook.missing-script` | error | internal-consistency | holds | new `args` exec form already walked; `${CLAUDE_PLUGIN_DATA}` is skipped, not guessed |
| `claude.hook.invalid-group` | error | internal-consistency | holds | every official example nests `{ matcher, hooks }` |
| `claude.hook.command-without-command` | error | spec-required | holds | "`command` — yes" |
| `claude.hook.http-without-url` | error | spec-required | holds | "`url` — yes" |
| `claude.hook.mcp-tool-without-server-or-tool` | error | spec-required | holds | "`server` — yes", "`tool` — yes" |
| `claude.hook.unknown-handler-type` | error | spec-required | holds | "`type` — yes — `command`, `http`, `mcp_tool`, `prompt`, or `agent`" |
| `claude.hook.prompt-without-prompt` | error | spec-required | holds | "`prompt` — yes" for prompt and agent |
| `claude.hook.incompatible-handler` | error | spec-required | holds | three tiers (13 all-five, 18 command/http/mcp_tool, `SessionStart`+`Setup` command/mcp_tool) match verbatim |

### Native VS Code hooks — [vscode-hooks.md](vscode-hooks.md)

Source: https://code.visualstudio.com/docs/agent-customization/hooks

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `vscode.hook.unknown-event` | error | spec-required | holds | "VS Code supports eight hook events" — same eight |
| `vscode.hook.missing-script` | error | internal-consistency | holds | OS overrides still selected by host platform |
| `vscode.hook.invalid-group` | error | internal-consistency | holds | |
| `vscode.hook.command-without-command` | error | spec-required | holds | "Each hook entry must specify `type: "command"` and a command" |
| `vscode.hook.unknown-handler-type` | error | spec-required | holds | same line |

### Copilot CLI hooks — [copilot-hooks.md](copilot-hooks.md)

Source: https://docs.github.com/en/copilot/reference/hooks-reference

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `copilot.hook.unknown-event` | error | spec-required | **corrected** | 14 camelCase names hold; PascalCase `SessionEnd`, `PostToolUseFailure`, `ErrorOccurred`, `PermissionRequest` are documented and were rejected |
| `copilot.hook.missing-script` | error | internal-consistency | holds | now also path-checks `exec` |
| `copilot.hook.command-without-command` | error | spec-required | **corrected** | "one of `bash`, `powershell`, or `command`, unless `exec` is specified" — `exec` was not accepted |
| `copilot.hook.http-without-url` | error | spec-required | holds | "`url` — Yes" |
| `copilot.hook.prompt-without-prompt` | error | spec-required | holds | "`prompt` — Yes" |
| `copilot.hook.unknown-handler-type` | error | spec-required | holds | command / http / prompt; `type` defaults to command |
| `copilot.hook.incompatible-handler` | error | spec-required | holds | "Prompt hooks … are only supported on `sessionStart`" |

### Command Code hooks — [commandcode-hooks.md](commandcode-hooks.md)

Source: https://commandcode.ai/docs/hooks · https://commandcode.ai/docs/settings

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `commandcode.hook.unknown-event` | error | spec-required | holds | table lists exactly `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart` |
| `commandcode.hook.missing-script` | error | internal-consistency | holds | |
| `commandcode.hook.invalid-group` | error | spec-required | holds | "`hooks` — Required — array"; "`matcher` — Optional — string" |
| `commandcode.hook.command-without-command` | error | spec-required | holds | "`command` — Required when `type: "command"` — string" |
| `commandcode.hook.unknown-handler-type` | error | spec-required | holds | "`type` — Required — Supports command adapter only" |
| `commandcode.hook.timeout-out-of-bounds` | error | spec-required | holds | settings page: "optional `timeout` (in seconds, 0–600)" |

### Grok Build hooks — [grok-hooks.md](grok-hooks.md)

Source: https://docs.x.ai/build/features/hooks

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `grok.hook.unknown-event` | error | spec-required | holds | 14 names in the event table |
| `grok.hook.missing-script` | error | internal-consistency | holds | |
| `grok.hook.invalid-group` | error | spec-required | holds | nested example; matcher is a regex string |
| `grok.hook.command-without-command` | error | spec-required | holds | |
| `grok.hook.http-without-url` | error | spec-required | holds | "`type` is `"command"` or `"http"` (with a `url` to POST the event to)" |
| `grok.hook.unknown-handler-type` | error | spec-required | holds | same line |

### Skills — [skills.md](skills.md), [agent-skills.md](agent-skills.md), [grok-skills.md](grok-skills.md)

Sources: https://code.claude.com/docs/en/skills · https://agentskills.io/specification · skills-ref validator · https://docs.x.ai/build/features/skills-plugins-marketplaces

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `skill.missing-skill-md` | warning | internal-consistency | holds | "A skill is a directory containing, at minimum, a `SKILL.md` file" |
| `claude.skill.missing-frontmatter` | warning | spec-required | holds | |
| `claude.skill.missing-description` | info | vendor-recommendation | holds | "`description` — Recommended … If omitted, uses the first paragraph" |
| `agent-skills.skill.missing-frontmatter` | error | spec-required | holds | "must contain YAML frontmatter" |
| `agent-skills.skill.missing-name` | error | spec-required | holds | "`name` — Yes" |
| `agent-skills.skill.missing-description` | error | spec-required | holds | "`description` — Yes … Non-empty" |
| `agent-skills.skill.invalid-name` | error | spec-required | **corrected** | "unicode lowercase alphanumeric"; validator uses `isalnum()` + lowercase; ASCII regex rejected `résumé-builder` |
| `agent-skills.skill.name-does-not-match-directory` | error | spec-required | holds | "Must match the parent directory name" |
| `agent-skills.skill.name-too-long` | error | spec-required | holds | "Must be 1-64 characters" |
| `agent-skills.skill.description-too-long` | error | spec-required | holds | "Must be 1-1024 characters" |
| `agent-skills.skill.invalid-compatibility` | error | spec-required | holds | "Must be 1-500 characters if provided" |
| `agent-skills.skill.invalid-metadata` | error | spec-required | holds | "A map from string keys to string values" |
| `agent-skills.skill.invalid-allowed-tools` | error | spec-required | holds | "A space-separated string" (Agent Skills profile only; Claude and Grok accept lists) |
| `agent-skills.skill.body-too-large` | info | vendor-recommendation | holds | "Keep your main `SKILL.md` under 500 lines" |
| `grok.skill.missing-frontmatter` | error | spec-required | holds | "`SKILL.md` starts with YAML frontmatter"; name/description optional |
| `skill.broken-reference` | warning | internal-consistency | holds | "use relative paths from the skill root" |
| `skill.duplicate-description` | info | heuristic | holds | labelled heuristic; no spec claim |
| `skill.locked-not-installed` | warning | internal-consistency | holds | lockfile vs disk |
| `skill.not-in-lock` | info | heuristic | holds | installer policy |
| `skill.description-budget` | info | vendor-recommendation | holds | "1% of the model's context window"; "capped at 1,536 characters" |
| `skill.no-lockfile` | info | heuristic | holds | opt-in only |

### Agents — [agents.md](agents.md), [claude-subagents.md](claude-subagents.md), [commandcode-agents.md](commandcode-agents.md)

Sources: https://code.claude.com/docs/en/sub-agents · https://commandcode.ai/docs/agents

| id | sev | provenance | verdict | note |
|----|-----|------------|---------|------|
| `claude.agent.missing-frontmatter` | error | spec-required | holds | skip list: "An opening `---` that isn't the file's first line … treats it as documentation" |
| `claude.agent.missing-description` | error | spec-required | holds | skip list: "A `name` but no `description`: Claude Code skips the file" |
| `claude.agent.missing-name` | error | spec-required | holds | skip list: "No `name`: … treats the file as documentation" |
| `claude.agent.duplicate-name` | error | spec-required | holds | scoped to one `.claude/agents/` tree; nested layers are nearest-wins |
| `claude.agent.invalid-name` | warning / error | spec-required | holds | "lowercase letters and hyphens"; error tier = "starts with `-` or contains `:` … skips the file" |
| `commandcode.agent.reserved-name` | error | spec-required | holds | "Reserved names (explore, plan, review, general) … A custom file with one of these names is ignored" |
| `commandcode.agent.invalid-permission-mode` | error | spec-required | **corrected** | Default column is `inherit`; explicit `permissionMode: inherit` was reported as invalid |
| `commandcode.agent.invalid-field-type` | error | spec-required | holds | typed table unchanged; `reasoningEffort` now documented, invalid values fall back and load — no check |

### MCP — [mcp.md](mcp.md) and the per-provider `*-mcp.md` files

| id | sev | provenance | source | verdict | note |
|----|-----|------------|--------|---------|------|
| `claude.mcp.no-launch` | error | spec-required | code.claude.com/docs/en/mcp | holds | |
| `claude.mcp.url-without-type` | error | spec-required | same | holds | quote verbatim on the page |
| `claude.mcp.reserved-name` | error | spec-required | same | holds | `workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview`, `Claude Browser` |
| `mcp.command-missing` | error | internal-consistency | all | holds | |
| `security.hardcoded-secret` | error | security | all | holds | token shapes; value never echoed |
| `mcp.literal-env` | warning | security | all | **corrected** | Gemini documents `%VAR_NAME%` (Windows) as interpolation; it was reported as a literal |
| `vscode.mcp.no-launch` | error | spec-required | code.visualstudio.com/…/mcp-servers | holds | `servers` wrapper; `command` or `url` |
| `cursor.mcp.no-launch` | error | spec-required | cursor.com/docs/context/mcp | holds | `command` or `url`; no url-without-type rule |
| `antigravity.mcp.no-launch` | error | spec-required | antigravity.google/docs/mcp | holds | "you must define the `serverUrl` field. Legacy fields like `url` or `httpUrl` are not supported" |
| `codex.mcp.no-launch` | error | spec-required | developers.openai.com/codex/mcp | holds | "`command` (required)" / "`url` (required)" |
| `gemini.mcp.no-launch` | error | spec-required | gemini-cli docs/tools/mcp-server.md | holds | "Required (one of the following): `command`, `url`, `httpUrl`" |
| `gemini.mcp.underscore-alias` | warning | vendor-recommendation | same | holds | "Do not use underscores (`_`) in your MCP server names" |
| `opencode.mcp.no-launch` | error | spec-required | opencode.ai/v2/docs/mcp-servers | holds | fallback only |
| `opencode.mcp.missing-type` | error | spec-required | same | holds | "must be `"local"`" / "must be `"remote"`" |
| `opencode.mcp.local-without-command` | error | spec-required | same | holds | "`command` — Yes" |
| `opencode.mcp.remote-without-url` | error | spec-required | same | holds | |
| `opencode.mcp.invalid-launch-for-type` | error | spec-required | same | holds | |
| `opencode.mcp.command-not-array` | error | spec-required | same | holds | "Executable followed by its arguments"; every example is an array |
| `continue.mcp.no-launch` | error | spec-required | docs.continue.dev/…/mcp + /reference | holds | `command`, `url`, or hub `uses:` |
| `continue.mcp.missing-block-metadata` | error | spec-required | same | holds | "include the required metadata fields (`name`, `version`, `schema`)" |
| `commandcode.mcp.no-launch` | error | spec-required | commandcode.ai/docs/mcp | holds | |
| `commandcode.mcp.invalid-transport` | error | spec-required | same + code.claude.com/docs/en/mcp | **corrected** | Claude's `streamable-http` alias on shared `.mcp.json`, and `sse` ("OAuth works with HTTP and SSE transport servers") on Command Code files, were reported as invalid |
| `commandcode.mcp.http-without-url` | error | spec-required | same | holds | schema tab: `transport: "http"` + `url` |
| `commandcode.mcp.stdio-without-command` | error | spec-required | same | holds | |
| `grok.mcp.no-launch` | error | spec-required | docs.x.ai/build/features/mcp-servers | holds | `command` or `url`; no `type` |
| `windsurf.mcp.no-launch` | error | spec-required | docs.windsurf.com/windsurf/cascade/mcp | holds | "requires a `serverUrl` or `url` field" |

### Budgets and rule files — [thresholds.md](thresholds.md), [cursor-rules.md](cursor-rules.md), [windsurf-rules.md](windsurf-rules.md), [codex-agents-md.md](codex-agents-md.md)

| id | sev | provenance | source | verdict | note |
|----|-----|------------|--------|---------|------|
| `budget.agents-md` | info | heuristic | agents.md | holds | page has no size rule; stays labelled heuristic |
| `budget.claude-md` | info | vendor-recommendation | code.claude.com/docs/en/memory | holds | "Size: target under 200 lines per CLAUDE.md file" |
| `budget.agents` | info | heuristic | secondary | holds | labelled heuristic |
| `budget.mcp` | info | heuristic | secondary | holds | labelled heuristic |
| `codex.budget.instructions` | info | vendor-recommendation | learn.chatgpt.com/…/agents-md | holds | "stops adding files once the combined size reaches … `project_doc_max_bytes` (32 KiB by default)" |
| `cursor.rule.too-large` | info | vendor-recommendation | cursor.com/docs/rules | holds | "Keep rules under 500 lines" |
| `windsurf.rule.too-large` | info | vendor-recommendation | docs.windsurf.com/…/memories | holds | "Workspace rule files are limited to 12,000 characters each" |
| `windsurf.rule.global-too-large` | info | vendor-recommendation | same | holds | "The global rules file is limited to 6,000 characters" |
| `windsurf.rule.missing-trigger` | warning | spec-required | same | holds | "Each workspace rule declares an activation mode in its frontmatter via the `trigger` field" |

## Corrections

Each row is a configuration the vendor documents as valid that agentscan
reported as broken, reproduced with `agentscan check` before the fix.

| # | id | what fired | published line | fix |
|---|----|------------|----------------|-----|
| 1 | `commandcode.mcp.invalid-transport` | `.mcp.json` entry `{ "type": "streamable-http", "url": … }` → error | Claude MCP: "the `type` field accepts `streamable-http` as an alias for `http`" | `streamable-http` added to `CLAUDE_MCP_TRANSPORTS` |
| 2 | `commandcode.mcp.invalid-transport` | `transport: "sse"` in `.commandcode/settings.json` `mcp.servers` → error | Command Code MCP: "OAuth works with HTTP and SSE transport servers" | `sse` tolerated on Command Code files (`COMMANDCODE_TOLERATED_MCP_TRANSPORTS`) |
| 3 | `agent-skills.skill.invalid-name` | `.agents/skills/résumé-builder` with `name: résumé-builder` → error | Agent Skills: "unicode lowercase alphanumeric characters"; skills-ref: `isalnum()` + `name == name.lower()` | `^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$` plus lowercase equality |
| 4 | `copilot.hook.command-without-command` | `{ "type": "command", "exec": "my-guard", "args": […] }` in a `version: 1` file → error | Copilot: "One of `bash`, `powershell`, or `command`, unless `exec` is specified" | `exec` accepted as the launch; `args` passed through; `exec` path-checked |
| 5 | `copilot.hook.unknown-event` | `SessionEnd`, `PostToolUseFailure`, `ErrorOccurred`, `PermissionRequest` in a `version: 1` file → 4 errors | Copilot: headings "`sessionEnd` / `SessionEnd`", "`postToolUseFailure` / `PostToolUseFailure`", "`errorOccurred` / `ErrorOccurred`"; "PascalCase `PermissionRequest`" | `COPILOT_PASCAL_ALIASES`, Copilot profile only |
| 6 | `mcp.literal-env` | `.gemini/settings.json` env `"GITHUB_TOKEN": "%GITHUB_TOKEN%"` → warning | Gemini: "or `%VAR_NAME%` (Windows only)" | `%VAR%` added to both interpolation regexes |
| 7 | `commandcode.agent.invalid-permission-mode` | `permissionMode: inherit` → error | Command Code agents: "permissionMode \| string \| No \| **inherit** \| Overrides the session mode: …" | `inherit` accepted |

A project that used only the documented Copilot forms (#4 + #5) scored
**50/100** before the fix and **100/100** after. The other five each cost 10
points (or 3 for #6) on a working configuration.

## Reviewed and deliberately not changed

- **`maxTurns` must be a positive integer.** The Command Code page types it as
  "integer" with default 100 and "Caps the agent's loop"; `0` and negatives
  stay rejected as a judgement, recorded in
  [commandcode-agents.md](commandcode-agents.md).
- **Copilot `Notification` PascalCase.** Only the payload shows
  `hook_event_name: "Notification"`; there is no `notification` /
  `Notification` heading. Not added. See [copilot-hooks.md](copilot-hooks.md).
- **Claude `type: "mcp-tool"`.** The scanner accepts the hyphen spelling as an
  alias; the page documents only `mcp_tool`. Accepting is the safe direction
  and costs nothing, so it stays.
- **Codex `project_doc_max_bytes` wording.** config-advanced says "how much to
  read from each AGENTS.md file"; the AGENTS.md guide says the cap is on the
  combined size. The guide is the detailed source; combined stays.
- **Cursor `auth.CLIENT_SECRET` literals.** Closed in plan 039 by
  `mcp.literal-credential`, which inspects `headers`, `http_headers`, and
  `auth` (field paths only; values never echoed). Grok `{{session_id}}` and
  Gemini `%VAR%` in those maps are interpolation, not literals.

## Re-run

Everything above can be re-checked with the release-time script:

```bash
bun run spec:check
```

It diffs the Claude, VS Code, Copilot CLI (camelCase, Copilot-only, and the
PascalCase aliases), Command Code, and Grok event sets against the live pages
and warns when any capture is over 90 days old.
