<h1 align="center">agentscan</h1>

<p align="center">
  <em>Your agent config says the guard is on. The script is gone. Nothing told you.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/checks-87-111111?style=flat-square" alt="87 checks">
  <img src="https://img.shields.io/badge/tests-420%20passing-111111?style=flat-square" alt="420 tests">
  <img src="https://img.shields.io/badge/network-none-111111?style=flat-square" alt="No network">
  <img src="https://img.shields.io/badge/writes-none-111111?style=flat-square" alt="Writes nothing">
  <img src="https://img.shields.io/badge/runs%20on-node%20%C2%B7%20bun-111111?style=flat-square" alt="Node or Bun">
  <img src="https://img.shields.io/npm/v/@chimix/agentscan?style=flat-square&color=111111&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-1.1.0-111111?style=flat-square" alt="Changelog"></a>
</p>

<p align="center">
  <strong>87 checks &middot; offline &middot; 0 network calls on <code>check</code> &middot; provenance on every rule</strong><br>
  <sub>An offline linter for Claude Code, Command Code, portable Agent Skills, nested AGENTS.md, Copilot CLI hooks, and the MCP / hooks / rules surfaces that 1.1.0 actually implements. Spec-required checks cite a published line in <a href="docs/spec/">docs/spec/</a>. Heuristics stay at <code>info</code> and say so. The coverage matrix below is the honesty contract — five dimensions, and a documented global location that is not scanned stays unread.</sub>
</p>

---

Linters read the code your agent writes. This reads **the agent itself** — skills, `skills-lock.json`, hooks, MCP servers, agent definitions, policy files.

## The failure it exists for

You registered a `PreToolUse` hook to stop destructive shell commands:

```jsonc
// .claude/settings.json
{ "hooks": { "PreToolUse": [{ "hooks": [
  { "type": "command", "command": ".claude/hooks/guard-destructive-bash.js" }
] }] } }
```

Someone deleted the script six weeks ago.

```console
$ ls .claude/hooks/guard-destructive-bash.js
ls: cannot access '.claude/hooks/guard-destructive-bash.js': No such file or directory
```

Your agent starts normally. No warning, no error, no log line. The guard you
think you have has silently not existed for six weeks.

```console
$ agentscan check

ERROR   rule:claude.hook.missing-script
        PreToolUse hook points at a script that does not exist: .claude/hooks/guard-destructive-bash.js
          PreToolUse @ .claude/settings.json · .claude/hooks/guard-destructive-bash.js

Summary: 1 error · score 90/100
```

That is the whole category: **a config file asserting something that is not true
of the filesystem**, where nothing else in your stack will ever tell you.

## How it works

No AI, no network on `check`. Read the config, read the disk, compare:

```
1. Discover    .claude/ .commandcode/ .agents/ .vscode/ .cursor/ .codex/ .gemini/ .github/ .continue/ AGENTS.md skills-lock.json
2. Extract     immutable facts — never re-read during checking
3. Check       87 checks, each labeled spec-required, vendor-recommendation,
               security, internal-consistency, or heuristic
4. Report      text · --json · --output prompt (handoff for a fixing agent)
```

Same tree in, same findings out, every time. It never writes to the tree it
scans and never opens a socket.

## What it will not do

It will not compare a Claude-native skill's frontmatter `name` to its directory
(portable Agent Skills under `.agents/skills` and Cursor `.cursor/skills` still
require that match), and it will not validate model ids or MCP tool names.
Those last two need a hardcoded list of valid values, with everything absent
from the list reported as broken. That is exactly how the 25 false findings
happened: a hook-event list with 9 names when the spec has 31, calling working
hooks dead at severity `error`.

A spec-required check has to point at a published line. If it cannot, it does
not ship as an error. Size opinions and installer policy remain as `info`
heuristics and are labeled that way in the registry.

## Try it in 30 seconds

No project handy? Run the built-in demo — it builds a throwaway fixture with the
killer case (a `PreToolUse` hook pointing at a missing script), prints the human
report, and deletes the fixture:

```bash
npx @chimix/agentscan@latest demo
```

Against a real project, it reads that tree, writes nothing, and never leaves
your machine:

```bash
cd ~/your-project
npx @chimix/agentscan@latest
```

Works on Node 20.11+ or Bun — the published bin is a single bundled file with
no dependencies to install. `bunx --bun @chimix/agentscan` is the same thing on
Bun.

The package is scoped `@chimix/agentscan` because npm rejects the bare name as
too close to an unrelated `agent-scan`. The command you type stays `agentscan`.

```bash
bun add -d @chimix/agentscan     # then: bunx agentscan check
```

Point it at a project that actually has agent config — a `.claude/` or
`.commandcode/` directory, an `.mcp.json`, an `AGENTS.md`. A directory with
agent config and no `package.json` is still scannable. On a directory with
neither it exits with a clear error.

```bash
# what it could possibly report, before you run it
bunx @chimix/agentscan rules

# the interesting bits it hides by default
bunx @chimix/agentscan check ~/your-project --verbose

# why one specific finding fired
bunx @chimix/agentscan explain claude.hook.missing-script:hook:PreToolUse:./x.js ~/your-project
```

`check` never opens a socket and never writes to the tree it scans. Contributing
needs **Bun** 1.4+ — the version CI pins and every gate is verified on; the
text `bun.lock` this repo ships cannot be read by 1.1 at all. The repo runs
TypeScript directly and `bun run build`
bundles it for Node.

### In CI

The Action runs from its own checkout, so it uses the ref you pin rather than
whatever is on npm:

```yaml
- uses: SimaAlexandru99/agentscan@v1
  with:
    fail-on: error
```

### From a checkout

```bash
git clone --depth=1 https://github.com/SimaAlexandru99/agentscan
cd agentscan && bun install
bun run src/cli.ts check ~/your-project
```

## Usage

```bash
bunx agentscan check                 # text report (cwd)
bunx agentscan check ./my-app        # explicit root
bunx agentscan check --json          # machine-readable
bunx agentscan check --quiet         # summary only
bunx agentscan check --verbose       # include KEEP, info findings, and each finding's id
bunx agentscan check --fail-on warning
bunx agentscan check --global        # also scan global skill dirs

bunx agentscan demo                  # one-shot fixture (no project required)
bunx agentscan explain <findingId>   # detail one finding
bunx agentscan rules                 # every check + rule id that can fire
bunx agentscan init                  # write .agentscanrc.json
```

Flags for `check`:

| Flag | Meaning |
|------|---------|
| `--json` | JSON report (alias for `--output json`) |
| `--output <format>` | `human` (default) · `json` · `prompt` |
| `--copy` | Also copy the report to the system clipboard |
| `--no-color` | Never colour, even on a terminal (`NO_COLOR=1` does the same) |
| `--quiet` | Summary line only |
| `--verbose` | Show KEEP + info-severity findings, and print each finding's id |
| `--fail-on <level>` | `never` (default) · `warning` · `error` |
| `--fail-under <0-100>` | Fail when the score drops below this floor |
| `--global` | Also scan `~/.claude/skills`, `~/.codex/skills`, `~/.commandcode/skills`, and `~/.agents/skills` (see below) |
| `--config <path>` | Config file path |

**v1 does not write the tree** — no `apply`, no skill delete/install. Findings may *suggest* shell commands; you run them yourself.

## Sample output

```text
  ┌─────┐   34/100  broken  ·  touchagency
  │ ✕ ✕ │   █████████░░░░░░░░░░░░░░░░
  │  ⌒  │   6 error · 2 warning · 11 info hidden (--verbose)
  └─────┘

agentscan v1.1.0 — touchagency

Scanned: 46 deps · 108 skills · 1 mcp · 2 agents · packageManager=bun

ERROR   rule:claude.hook.missing-script  ×6
        Hook points at a script that does not exist
          PostToolUse @ .claude/settings.json · .claude/hooks/notify-related-tests.js
          PreToolUse @ .claude/settings.json · .claude/hooks/guard-destructive-bash.js
          PreToolUse @ .claude/settings.json · .claude/hooks/protect-artists-json.js
          PreToolUse @ .claude/settings.json · .claude/hooks/protect-env.js

WARN    rule:claude.agent.invalid-name  ×2
        2 findings
          .claude/agents/marketing-seo-specialist.md
          .claude/agents/testing-accessibility-auditor.md

Summary: 6 error · 2 warning · 11 info hidden (--verbose) · score 34/100 broken
```

On a terminal the header is coloured green, yellow or red and the face tracks
the score. Redirect or pipe it and you get exactly the text above, with no
escape sequences — the header box is dropped too, so `--json`, `--output
prompt`, CI logs and `--copy` are unchanged by any of this.

The `Scanned:` line is orientation only — which project, how big. The summary
lists severities (error / warning / info); a clean project prints
`Summary: no findings`. Score and `--fail-on` still use severity under the hood.

JSON shape (abridged):

```json
{
  "version": "1.1.0",
  "root": "/path/to/project",
  "factsSummary": {
    "packageManager": "bun",
    "depCount": 1,
    "skillCount": 1,
    "globalSkillCount": 0
  },
  "findings": [
    {
      "id": "claude.hook.missing-script:hook:PreToolUse:.claude/hooks/protect-env.js",
      "ruleId": "claude.hook.missing-script",
      "action": "warn",
      "severity": "error",
      "subject": "hook:PreToolUse:.claude/hooks/protect-env.js",
      "message": "PreToolUse hook points at a script that does not exist: .claude/hooks/protect-env.js",
      "reason": "The hook is registered but its script is missing, so it never runs.",
      "evidence": [{ "kind": "script", "value": ".claude/hooks/protect-env.js" }],
      "suggest": "Restore the script or remove the hook"
    }
  ]
}
```

Same tree → same sorted findings, with stable unique `id`s.

### `--global`

Adds `~/.claude/skills`, `~/.codex/skills`, `~/.commandcode/skills`, and
`~/.agents/skills` to the structural checks: a `SKILL.md` that is malformed is
malformed wherever it lives, and those findings carry a `source: global`
evidence entry so you can tell them apart. Codex and Command Code skills use
the Agent Skills contract (`name` and `description` required). `--global` also
inventories user Command Code agents (`~/.commandcode/agents`), MCP
(`~/.commandcode/mcp.json` and user settings `mcp.servers`), and memory
(`~/.commandcode/AGENTS.md`). It never opens `auth.json` or `mcp-tokens.json`.

Lockfile checks stay project-scoped — a project lockfile cannot pin a skill that
lives in your home directory, so reporting one as "not in the lockfile" could
only ever be wrong. In a monorepo, each `skills-lock.json` governs only the
skills under its directory (nearest lock wins). A skill with no ancestor
lockfile is not compared to a distant lock.

`includeGlobal: true` in `.agentscanrc.json` does the same thing without the
flag.

## Score

```
score = max(0, 100 - 10 × errors - 3 × warnings)
```

That is the whole formula. Count two lines of the report and you can recompute
it. The comparable tools both score 0-100 and neither states its formula in
prose: shadscan's category weights are readable in its MIT source but not
documented, and react-doctor computes the score by POSTing your diagnostics to
`react.doctor/api/score`, so it cannot be recomputed offline at all. A number
whose derivation cannot be inspected is the false precision a score is supposed
to replace.

**Deduction, not coverage.** The obvious model — checks passed over checks run —
was measured against 17 real projects and rejected. Every one scored between
97.7% and 100%, so it discriminated nothing, and it *inverted* severity: the
denominator grows with the size of your config while the defects do not, so a
project with 85 skills and one warning outscored a project with 10 skills and
the same one warning. Deduction has no denominator. Measured on the same 17
projects it spans 40 to 100, and the 85-skill project scores 97 while a
54-skill one with six broken hooks scores 40.

**Info findings cost nothing.** They are budgets and hygiene notes, and they do
grow with project size — charging for them would reintroduce the inversion.

The score is a summary, not a verdict. `--fail-on error` is still the sharper
CI gate: it says which *kind* of problem fails the build, where `--fail-under`
only says how many points of unspecified trouble is too much.

## Exit codes

| Code | When |
|------|------|
| `0` | OK, or findings below `--fail-on` threshold (default `never` always `0` for findings) |
| `1` | Findings at/above `--fail-on`, or score below `--fail-under` |
| `2` | Usage / config / load error |

## CI

```yaml
- uses: SimaAlexandru99/agentscan@v1
  with:
    fail-on: error        # never | warning | error
    output: human         # human | json | prompt
```

The action installs Bun, runs the scan, and exposes the report as the `report`
output so a later step can post it. Or run it directly:

```yaml
- name: agentscan
  run: bunx agentscan check --fail-on error
```

Or with a local checkout of this repo:

```bash
bun run src/cli.ts check --fail-on warning --json
```

Default `failOn` is `never` so local runs stay non-blocking until you opt in.

## Config

Optional `.agentscanrc.json` (create with `agentscan init`):

```json
{
  "skillPaths": [".agents/skills", ".claude/skills", "skills", ".cursor/skills", ".codex/skills", ".commandcode/skills"],
  "mcpPaths": [".mcp.json", ".claude/mcp.json", "mcp.json", ".vscode/mcp.json", ".cursor/mcp.json", ".agents/mcp_config.json", ".codex/config.toml", ".gemini/settings.json", "opencode.json", "opencode.jsonc", ".opencode/opencode.json", ".opencode/opencode.jsonc", ".continue/config.yaml", ".continue/mcpServers"],
  "policyFiles": ["AGENTS.md", "CLAUDE.md"],
  "ignoreSkills": [],
  "ignoreRules": [],
  "ignoreFindings": [],
  "failOn": "never",
  "includeGlobal": false,
  "requireLock": false,
  "thresholds": {
    "skillListingChars": 8000,
    "skillListingMaxDescChars": 1536,
    "mcp": 5,
    "agentsMdLines": 150,
    "claudeMdLines": 200,
    "agents": 8
  }
}
```

Budget rules are **info** (hidden unless `--verbose`) so they do not flood default text or CI with `--fail-on warning`.

### Handing findings to an agent

```bash
agentscan check --output prompt
```

A paste-ready markdown handoff: each item carries the message, why it matters,
the suggested fix, its evidence, and its finding id. Info-severity findings are
left out — budgets and hygiene notes are for a maintainer to weigh, not work
items for an executor.

### Getting the report out of the terminal

Saving and piping are the shell's job, and it already does them:

```bash
agentscan check --output prompt > handoff.md   # save
agentscan check --output prompt | claude       # send to another tool
agentscan check --json | jq '.findings[]'      # filter
```

The clipboard is the one thing no shell does portably, so that one is a flag:

```bash
agentscan check --output prompt --copy
```

`--copy` tries `wl-copy`, `xclip`, `xsel`, `pbcopy`, `clip.exe` in turn and uses
the first that succeeds — being installed is not the same as working, and on a
headless WSL shell the first two are present and both fail. The report still
goes to stdout; the "copied" note goes to stderr, so `--copy` composes with
redirection. A clipboard that cannot be reached prints why and does not change
the exit code.

This is the only place agentscan starts a subprocess, and it runs only under
`--copy`. It writes to the clipboard and nowhere else.

### Suppressing one finding

`ignoreRules` disables a check project-wide, which is too blunt when a single
hook uses an exotic launcher. `ignoreFindings` takes exact finding ids — the
same strings `agentscan explain` accepts. `check --verbose` prints the id under
each finding, and `--json` carries it as `.findings[].id`, so the value you copy
out of the report is the value you paste:

```json
{ "ignoreFindings": ["claude.hook.missing-script:hook:PreToolUse:./bin/wrapper"] }
```

## What it checks

Every check lives in `src/checks/` and runs on every `check`. `agentscan rules`
lists all of them with their ids; `agentscan explain <id>` details any finding.

Most validate one discovered item against its own file on disk. Budget and
hygiene checks are **info** (hidden unless `--verbose`). Each registry entry
carries `provenance`: spec-required, vendor-recommendation, security,
internal-consistency, or heuristic. `agentscan rules` lists them all.

| id | Severity | Catches |
|----|----------|---------|
| `config.unreadable` | error | A config file that is not valid JSON, so whatever it declares is silently not in effect |
| `scan.truncated` | info | A file past the scan cap, so the checks that read its body saw only a prefix — about this tool's reach, not about your project |
| `claude.hook.missing-script` | error | A registered Claude command hook whose script does not exist — it never runs |
| `claude.hook.unknown-event` | error | A Claude hook registered under an event name that is never dispatched |
| `vscode.hook.missing-script` | error | A VS Code command hook whose script does not exist |
| `vscode.hook.unknown-event` | error | A VS Code hook registered under an event name that is never dispatched |
| `claude.agent.missing-frontmatter` | error | A Claude agent definition with no `---` block |
| `claude.agent.missing-description` | error | Claude agent frontmatter has no `description` |
| `claude.agent.missing-name` | error | Claude agent frontmatter has no `name` |
| `claude.agent.invalid-name` | warning | Claude agent name is not lowercase letters and hyphens (error if it starts with `-` or contains `:`; filename is not compared) |
| `claude.agent.duplicate-name` | error | Multiple Claude agent files declare the same name |
| `claude.mcp.no-launch` | error | A Claude MCP server with neither `command` nor `url` |
| `claude.mcp.url-without-type` | error | A Claude remote MCP server with a `url` but no `type` — read as stdio and skipped. On shared `.mcp.json`, a Command Code `transport` field satisfies the other consumer and this check does not fire |
| `claude.mcp.reserved-name` | error | A Claude-consumed MCP server named with a reserved identifier (`workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview`, `Claude Browser`) — skipped at load |
| `vscode.mcp.no-launch` | error | A VS Code MCP server (`servers`) with neither `command` nor `url` |
| `cursor.mcp.no-launch` | error | A Cursor MCP server with neither `command` nor `url` |
| `antigravity.mcp.no-launch` | error | An Antigravity MCP server with neither `command` nor `serverUrl` |
| `codex.mcp.no-launch` | error | A Codex `[mcp_servers.*]` entry with neither `command` nor `url` |
| `gemini.mcp.no-launch` | error | A Gemini MCP server with neither `command`, `url`, nor `httpUrl` |
| `gemini.mcp.underscore-alias` | warning | A Gemini MCP server alias contains `_`, which can make policies fail silently |
| `opencode.mcp.no-launch` | error | An OpenCode MCP server with neither `command` nor `url` |
| `opencode.mcp.missing-type` | error | An OpenCode MCP server missing `type: local` or `type: remote` |
| `opencode.mcp.local-without-command` | error | An OpenCode `type: local` server with no `command` |
| `opencode.mcp.remote-without-url` | error | An OpenCode `type: remote` server with no `url` |
| `opencode.mcp.invalid-launch-for-type` | error | An OpenCode server whose launch field does not match its `type` |
| `opencode.mcp.command-not-array` | error | An OpenCode V2 local `command` that is not an argv array |
| `continue.mcp.no-launch` | error | A Continue MCP server with neither `command`, `url`, nor `uses` |
| `continue.mcp.missing-block-metadata` | error | A standalone `.continue/mcpServers/*.yaml` block missing `name`, `version`, or `schema` (not applied to copied JSON) |
| `commandcode.mcp.no-launch` | error | A Command Code settings / user MCP server with neither `command` nor `url` |
| `commandcode.mcp.invalid-transport` | error | A Command Code MCP `transport` / `type` that is not `http` or `stdio` (Claude `sse` / `ws` on shared `.mcp.json` is skipped) |
| `commandcode.mcp.http-without-url` | error | A Command Code HTTP MCP server with no `url` |
| `commandcode.mcp.stdio-without-command` | error | A Command Code stdio MCP server with no `command` |
| `claude.hook.command-without-command` | error | A Claude `type: command` hook with no `command` |
| `claude.hook.http-without-url` | error | A Claude `type: http` hook with no `url` |
| `claude.hook.mcp-tool-without-server-or-tool` | error | A Claude `type: mcp_tool` hook missing `server` or `tool` |
| `claude.hook.unknown-handler-type` | error | A Claude hook whose required `type` is missing or not one of command, http, mcp_tool, prompt, agent |
| `claude.hook.prompt-without-prompt` | error | A Claude `type: prompt` or `type: agent` hook with no `prompt` |
| `claude.hook.incompatible-handler` | error | A Claude handler type that the event does not support |
| `claude.hook.invalid-group` | error | A Claude hook matcher group with no nested `hooks` array (flat handler arrays are invalid) |
| `vscode.hook.invalid-group` | error | A VS Code hook group that is not a command handler array |
| `vscode.hook.command-without-command` | error | A native VS Code `type: command` hook with no `command` |
| `vscode.hook.unknown-handler-type` | error | A native VS Code hook whose `type` is not `command` |
| `copilot.hook.unknown-event` | error | A Copilot CLI hook registered under an event that is never dispatched |
| `copilot.hook.missing-script` | error | A Copilot CLI command hook whose script does not exist |
| `copilot.hook.command-without-command` | error | A Copilot CLI command hook with none of `bash`, `powershell`, or `command` |
| `copilot.hook.http-without-url` | error | A Copilot CLI `type: http` hook with no `url` |
| `copilot.hook.prompt-without-prompt` | error | A Copilot CLI `type: prompt` hook with no `prompt` |
| `copilot.hook.unknown-handler-type` | error | A Copilot CLI hook whose `type` is not command, http, or prompt |
| `copilot.hook.incompatible-handler` | error | A Copilot CLI prompt hook registered on an event other than `sessionStart` |
| `commandcode.hook.unknown-event` | error | A Command Code hook registered under an event that is never dispatched (four events only) |
| `commandcode.hook.missing-script` | error | A Command Code command hook whose script does not exist |
| `commandcode.hook.invalid-group` | error | A Command Code hook group missing the required nested `hooks` array, or a non-string `matcher` |
| `commandcode.hook.command-without-command` | error | A Command Code `type: command` hook whose `command` is missing, empty, or not a string |
| `commandcode.hook.unknown-handler-type` | error | A Command Code hook whose `type` is missing, not a string, or not `"command"` |
| `commandcode.hook.timeout-out-of-bounds` | error | A Command Code hook `timeout` outside 0–600 seconds |
| `commandcode.agent.reserved-name` | error | A Command Code custom agent named `explore`, `plan`, `review`, or `general` — ignored at load |
| `commandcode.agent.invalid-permission-mode` | error | A Command Code agent `permissionMode` that is not a documented value |
| `commandcode.agent.invalid-field-type` | error | A Command Code agent field whose type the spec does not accept |
| `mcp.command-missing` | error | An MCP `command` that is a path-like value whose file does not exist on disk |
| `security.hardcoded-secret` | error | A token-shaped literal in MCP config (the value is never echoed back) |
| `mcp.literal-env` | warning | Secret-named `env` values that are literals instead of interpolation |
| `skill.missing-skill-md` | warning | A directory under a skill path with no `SKILL.md` |
| `claude.skill.missing-frontmatter` | warning | Claude `SKILL.md` with no `---` block |
| `claude.skill.missing-description` | info | Claude frontmatter has no `description` and no first markdown paragraph |
| `agent-skills.skill.missing-frontmatter` | error | Portable skill `SKILL.md` has no YAML frontmatter |
| `agent-skills.skill.missing-name` | error | Portable skill frontmatter has no required `name` |
| `agent-skills.skill.missing-description` | error | Portable skill frontmatter has no required `description` |
| `agent-skills.skill.invalid-name` | error | Portable skill name is not `[a-z0-9]` + hyphens |
| `agent-skills.skill.name-does-not-match-directory` | error | Portable skill `name` does not match its directory |
| `agent-skills.skill.name-too-long` | error | Portable skill name exceeds 64 characters |
| `agent-skills.skill.description-too-long` | error | Portable skill description exceeds 1024 characters |
| `agent-skills.skill.invalid-compatibility` | error | Portable skill `compatibility` is present but is not a 1–500 character string |
| `agent-skills.skill.invalid-metadata` | error | Portable skill `metadata` is present but is not `map<string, string>` |
| `agent-skills.skill.invalid-allowed-tools` | error | Portable skill `allowed-tools` is present but is not a string |
| `agent-skills.skill.body-too-large` | info | Portable skill `SKILL.md` exceeds the 500-line recommendation |
| `skill.broken-reference` | warning | The body points at a bundled file that does not exist |
| `skill.duplicate-description` | info | Two or more skills carry an identical description (heuristic) |
| `skill.locked-not-installed` | warning | `skills-lock.json` pins a skill that is not on disk |
| `skill.not-in-lock` | info | A skill on disk that the lockfile does not track (installer policy) |
| `skill.description-budget` | info | Claude skill listing text (description or first paragraph, plus `when_to_use`) exceeds the 1% context-window budget, with an 8000-character fallback and a 1536-character per-entry cap |
| `skill.no-lockfile` | info | Skills present with no lockfile at all (only with `requireLock`) |
| `budget.agents-md` | info | `AGENTS.md` past a secondary 150-line hint (heuristic; not an AGENTS.md requirement) |
| `budget.claude-md` | info | `CLAUDE.md` past the official “target under 200 lines” recommendation |
| `budget.agents` | info | More agent definitions than a focused set (>8) — heuristic proxy |
| `budget.mcp` | info | More MCP servers than a tool-selection hint (>5) — heuristic proxy |
| `codex.budget.instructions` | info | Codex root→cwd `AGENTS.md` chain exceeds the default 32 KiB |
| `cursor.rule.too-large` | info | A `.cursor/rules/*.mdc` file exceeds the 500-line recommendation |

### Coverage in 1.1.0

Each cell is one coverage dimension. There is no `full` / `partial` label: a
documented global or static location that is not opened stays **unread**.

Dimensions:

- **project discovery** — documented in-repo files the scanner opens
- **global discovery** — documented user / machine locations; `--global` is named when that is the only path that opens them
- **schema** — spec-required (and labeled vendor-recommendation) field checks
- **precedence** — documented merge / override / shadowing
- **conformance** — official-shaped fixture or equivalent negative tests

| Ecosystem | project discovery | global discovery | schema | precedence | conformance |
|-----------|-------------------|------------------|--------|------------|-------------|
| Agent Skills | `.agents/skills` (and Cursor / Codex / Command Code skill trees) | `--global` `~/.agents/skills`, `~/.codex/skills` | required `name` / `description` plus optional `compatibility` / `metadata` / `allowed-tools`; 500-line info | n/a | `agent-skills` fixture |
| AGENTS.md | nested walk-up | n/a | no required fields | nearest-wins | tests |
| Claude Code | project settings, skills, agents, `CLAUDE.md`, `.mcp.json` / `.claude/mcp.json` | unread `~/.claude/settings.json`, managed policy, marketplace plugins | 33 events; required handler `type`; MCP reserved names; first-paragraph skill description; listing budget | walk-up `CLAUDE.md` / `.claude/agents` | `claude-json` fixture |
| Command Code | git-root project files; per-directory `AGENTS.md` else `.commandcode/AGENTS.md` | `--global` `~/.commandcode/*`; unread `projects/{slug}/mcp.json` | 4 events; command handlers; Agent Skills; MCP `transport` / `type` | settings merge; project+user hooks coexist; skill/MCP shadow | `commandcode` fixture |
| Codex | `.codex/config.toml`, `.codex/skills`, AGENTS chain | `--global` `~/.codex/AGENTS.override.md` then `AGENTS.md` | TOML MCP; `project_doc_max_bytes`; Agent Skills | override > `AGENTS.md` > fallbacks; one file per dir; root→cwd; `project_root_markers` | `codex-toml` fixture |
| VS Code | `.github/hooks` without `version: 1`, instruction files, `.github/agents`, `.vscode/mcp.json` | `--global` `~/.copilot/hooks` without `version: 1`; unread policy dirs | 8 events; command-only | workspace over user | `vscode-hooks`, `vscode-json` |
| Copilot CLI | `.github/hooks` with `version: 1` | `--global` `~/.copilot/hooks` with `version: 1`; unread `/etc/github-copilot/policy.d` | camelCase + PascalCase map; `bash` / `powershell` / `command`; `cwd`; `timeoutSec`; prompt on `sessionStart` | documented sources coexist; policy unread | `copilot-hooks` fixture |
| Cursor | nested `.cursor/skills`, `.cursor/mcp.json`, `.cursor/rules` | unread documented Cursor user/global paths | Agent Skills; MCP launch; 500-line rules | n/a | `cursor-json` fixture |
| Grok | none | none | none | n/a | none |
| Antigravity | `.agents/mcp_config.json` | none | `serverUrl` launch | n/a | `antigravity-json` fixture |
| Gemini | `.gemini/settings.json` | unread `~/.gemini/settings.json` unless `--global` is wired for it (it is not) | `command` / `url` / `httpUrl`; underscore-alias warning | n/a | `gemini-json` fixture |
| Windsurf | none | unread (official page is global-only) | none | n/a | none |
| Kiro | none | none | none | n/a | none |
| Cline | none | none | none | n/a | none |
| Roo | none | none | none | n/a | none |
| Kilo | none | none | none | n/a | none |
| OpenCode | `opencode.json(c)` V1 and V2 | none | V2 local `command` must be an argv array | n/a | `opencode-json` fixture |
| Junie | none | none | none | n/a | none |
| Continue | `.continue/config.yaml`, `.continue/mcpServers/*` | none | launch `command` / `url` / `uses`; standalone YAML `name` / `version` / `schema` | n/a | `continue-yaml`, `continue-mcpservers` |

Cursor project rules (`.cursor/rules/**/*.mdc`) are a separate surface: discovery plus `cursor.rule.too-large` at info. Claude `.claude/rules/**/*.md` is inventoried and has no published line budget.

Old 0.7 rule ids still work in `ignoreRules` and `explain` (for example `hook.missing-script` aliases `claude.hook.missing-script`).

Agent definitions are checked for structure only. A Claude agent's frontmatter
`name` is not compared to the filename; it must be lowercase letters and
hyphens and unique. Command Code supplies `name` from the filename when
frontmatter omits it, and does not emit missing-name or missing-description.
Model identifiers and tool names are likewise not validated: both would need a
hardcoded list, which is the shape that already shipped a false error. See
[plans/003](plans/003-validate-agent-definitions.md).

`skill.broken-reference` reads the body, not just the frontmatter. It looks for
paths under the conventional bundled directories (`scripts/`, `references/`,
`assets/`, `templates/`, `examples/`). Agent Skills references resolve from the
skill root only. Claude native skills also try the repo root — of 1674
references measured across 17 projects, 1645 resolved skill-relative and 12 only
at the root. Fenced code blocks are stripped first: a path in an example is
illustration, not a pointer.

### Where it looks for hooks

The Claude hooks reference lists seven places a hook can be registered. agentscan
reads the four that live inside the scanned project, plus VS Code workspace hooks
and Command Code settings hooks:

| Registered in | Script paths resolve against |
|---|---|
| `.claude/settings.json` · `.claude/settings.local.json` | project root, `${CLAUDE_PROJECT_DIR}` |
| A plugin's `hooks/hooks.json` (a directory with `.claude-plugin/plugin.json`, or the scan root itself) | the plugin root, `${CLAUDE_PLUGIN_ROOT}` |
| `SKILL.md` frontmatter | the skill's own directory, then the project root |
| `.claude/agents/*.md` frontmatter | the agent file's directory, then the project root |
| `.github/hooks/*.json` without `version: 1` (native VS Code) | project root and the hooks directory |
| `.github/hooks/*.json` with `version: 1` (Copilot CLI) | project root, `cwd`, host `bash` / `powershell` / `command` |
| `~/.copilot/hooks` under `--global` | same split on `version: 1` |
| `.commandcode/settings.json` · `.commandcode/settings.local.json` (and user settings under `--global`) | Command Code project root (git root, or cwd outside a git repo), `$COMMANDCODE_PROJECT_DIR`, `$COMMANDCODE_CWD` |

`${CLAUDE_PLUGIN_ROOT}` is expanded **only** for a hook that came from a plugin.
In a settings file it names nothing, so the path is skipped rather than guessed
at — measured across 17 installed plugins, 31 of 33 plugin hook commands use it
and none of them are settings hooks. `claude.hook.unknown-event` covers all four sites
at no extra cost. Sources and measurements: [docs/spec/hook-sources.md](docs/spec/hook-sources.md).

`claude.hook.missing-script` and `mcp.command-missing` are deliberately conservative.
A value is only resolved when it is path-like and the answer is certain; shell
programs (`a && b`, `$(...)`, pipes), bare PATH binaries (`npx`, `uvx`), and
unresolved env vars are skipped. A false "broken" on a working `npx` server
would be worse than silence. `node -e "<code>"` is never treated as a path.
Only `$CLAUDE_PROJECT_DIR`, `$COMMANDCODE_PROJECT_DIR`, and `$COMMANDCODE_CWD`
are expanded — other variables are left alone rather than guessed at. Schema
checks judge misconfiguration, not whether a correctly shaped entry will start
at runtime.

Spec-required checks are written against published pages, not against what
happens to appear in real projects. Two that were written the other way round
shipped as false positives — a nine-name hook-event list where the spec has 31,
and a `name` must equal the directory rule that Claude's spec explicitly
contradicts. Both are gone. Heuristics that remain (`skill.duplicate-description`,
the installer lock checks, and the size budgets other than `budget.claude-md`
and `skill.description-budget`) are labeled in the registry and stay at `info`.

Assumptions are recorded in **[docs/spec/](docs/spec/)** with source URL, read
date, and provenance. When adding a spec-required check, add its spec line there
first.

## Known limits

- **No dependency→skill knowledge.** Nothing here says "you have `next`, you
  should add a `next-*` skill". That needed a hand-maintained registry, and the
  version that existed fired on none of the 17 projects measured, so it was
  removed. Skill provenance comes from `skills-lock.json` instead.
- **No rule produces `refresh` or `keep`.** Comparing a skill's content against
  the `computedHash` in `skills-lock.json` is the obvious `refresh` source; the
  hash algorithm used by the installing tool is not documented here, and it is
  not reproducible from `SKILL.md` bytes alone, so it is not implemented.
- **Runtime split.** Source development and the composite Action use Bun; the
  published `dist/cli.js` runs on Node 20.11+ or Bun. The source entrypoint uses
  Bun's `import.meta.dir` / `import.meta.main` and is not the Node entrypoint.
- **Command Code local MCP is unread.** `~/.commandcode/projects/{project}/mcp.json`
  is keyed by a working-directory slug that the sessions page does not publish.
  Until it does, that path is skipped rather than guessed. Bundled Command Code
  skills and `--skill` launch flags are not project files and are not scanned.
  `mods.paths` are inventoried; the TypeScript is never executed or imported.
  `auth.json` and `mcp-tokens.json` are never opened. Command Code project
  root is the git root (or cwd outside a git repo); a child `.cursor` does
  not hide `<git-root>/.commandcode/`. Spec/runtime Command Code checks skip
  shadowed lower-precedence definitions; secrets still inspect every readable
  MCP file.
- **Three Claude hook locations are unread.** `~/.claude/settings.json`, managed policy
  settings, and installed marketplace plugins under `~/.claude/plugins` all sit
  outside the scanned project, and the docs say a plugin's install directory
  changes on every update. A hook registered in one of those, pointing at a
  missing script, is not reported.
- **Copilot CLI policy hooks are unread.** `/etc/github-copilot/policy.d` and the
  Windows policy directory are machine-wide admin files. User
  `~/.copilot/hooks` is scanned only under `--global`. Inline Copilot
  `.github/copilot/settings.json` hooks are unread.
- **Gemini user settings are unread.** `~/.gemini/settings.json` is outside a
  normal project scan. Windsurf's official MCP page is global-only and is not
  scanned.
- **Bounded reads.** A `SKILL.md` is read to 64 KB and a policy file to 100 KB,
  so `skill.broken-reference` and `policyLines` see only that much of a larger
  file. This is reported — `scan.truncated`, at `info` — rather than left
  silent, and it says nothing about the file being valid: it is, and the tools
  that read it see all of it. Reporting the cap as `config.unreadable` at
  severity error is a defect this tool shipped and [plan 019](plans/019-findings-say-true-things.md) fixed.

## Releases

Notes for every published version are in [CHANGELOG.md](CHANGELOG.md).
GitHub already has pages for [v0.1.0](https://github.com/SimaAlexandru99/agentscan/releases/tag/v0.1.0)
and [v0.4.0](https://github.com/SimaAlexandru99/agentscan/releases/tag/v0.4.0).

**1.1.0** (31 August 2026) adds a native Command Code provider and finishes the
correctness pass across registered checks: hook schema profiles, Agent Skills
optional fields, Claude listing budget, Codex chain knobs, and Copilot CLI
`version: 1` files. Still offline on `check`. Shared `.mcp.json` is `mcp-json`
(Claude and Command Code), not Claude-only — that MCP hotfix is **1.0.1** in
the changelog and ships inside this package version.

**1.0.0** (30 August 2026) is the first stable release: 59 checks, 345 tests,
still offline on `check`. It adds portable Agent Skills (including Cursor and
Codex skill trees), MCP profiles for VS Code / Cursor / Codex / Antigravity /
Gemini / OpenCode / Continue, nested `AGENTS.md`, walk-up agents, VS Code
hooks, and platform-aware launch checks — a `windows:` script is not
POSIX-joined when the scanner runs on Linux. Old 0.7 rule ids still work in
`ignoreRules` and `explain`. 0.9.0 was planned as a separate train and shipped
inside this release.

## Development

```bash
bun install
bun run typecheck
bun test
bun run src/cli.ts check tests/fixtures/lock-drift
```

| Script | Command |
|--------|---------|
| `agentscan` | `bun run src/cli.ts` |
| `typecheck` | `tsc --noEmit` |
| `test` | `bun test` |
| `check` | `bun run src/cli.ts check` |

### Release checklist

Before publishing a release:

1. Confirm `package.json` and `src/version.ts` contain the same version.
2. Run `bun run build`, then verify `node dist/cli.js --version` prints it.
3. Run `bun run typecheck`, `bun test`, and `bun run spec:check`.
4. Refresh the test-count badge and version examples above from that release run.
5. Add a section to [CHANGELOG.md](CHANGELOG.md) for the version, then publish
   the GitHub release from that text.

## Design docs

**This README is the source of truth for current behavior.** The documents under
`docs/superpowers/specs/` are the original design and are **superseded** —
several decisions changed while building: the original Bun-only runtime claim was
superseded by a Node-compatible published bundle, the dep-to-skill map and its
"orphan" heuristic dropped in favour of `skills-lock.json`, budget checks added,
structural checks added, and the YAML rule engine deleted (`plans/010`). Read
them as history, not as behavior.

## Skill

A Cursor / Agent Skills file lives at [`skills/agentscan/SKILL.md`](skills/agentscan/SKILL.md). Copy the folder so the agent runs the audit before it edits hooks or claims a guard is in place:

```bash
cp -R skills/agentscan .cursor/skills/agentscan
# or: .agents/skills/agentscan
# or: .claude/skills/agentscan
```

## License

MIT
