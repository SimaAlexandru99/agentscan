<h1 align="center">agentscan</h1>

<p align="center">
  <em>Your agent config says the guard is on. The script is gone. Nothing told you.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/checks-59-111111?style=flat-square" alt="59 checks">
  <img src="https://img.shields.io/badge/tests-336%20passing-111111?style=flat-square" alt="336 tests">
  <img src="https://img.shields.io/badge/network-none-111111?style=flat-square" alt="No network">
  <img src="https://img.shields.io/badge/writes-none-111111?style=flat-square" alt="Writes nothing">
  <img src="https://img.shields.io/badge/runs%20on-node%20%C2%B7%20bun-111111?style=flat-square" alt="Node or Bun">
  <img src="https://img.shields.io/npm/v/@chimix/agentscan?style=flat-square&color=111111&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
</p>

<p align="center">
  <strong>59 checks &middot; offline &middot; 0 network calls on <code>check</code> &middot; provenance on every rule</strong><br>
  <sub>An offline linter for Claude Code, portable Agent Skills, nested AGENTS.md, and the MCP / hooks / rules surfaces that 1.0.0 actually implements. Spec-required checks cite a published line in <a href="docs/spec/">docs/spec/</a>. Heuristics stay at <code>info</code> and say so. The coverage matrix below is the honesty contract — <code>full</code> only where discovery, spec-required fields, and a conformance fixture (or equivalent tests) all exist.</sub>
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
1. Discover    .claude/ .agents/ .vscode/ .cursor/ .codex/ .gemini/ .github/ .continue/ AGENTS.md skills-lock.json
2. Extract     immutable facts — never re-read during checking
3. Check       59 checks, each labeled spec-required, vendor-recommendation,
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

Point it at a project that actually has agent config — a `.claude/` directory,
an `.mcp.json`, an `AGENTS.md`. A directory with agent config and no
`package.json` is still scannable. On a directory with neither it exits with a
clear error.

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
| `--global` | Also scan `~/.claude/skills` and `~/.codex/skills` (see below) |
| `--config <path>` | Config file path |

**v1 does not write the tree** — no `apply`, no skill delete/install. Findings may *suggest* shell commands; you run them yourself.

## Sample output

```text
  ┌─────┐   34/100  broken  ·  touchagency
  │ ✕ ✕ │   █████████░░░░░░░░░░░░░░░░
  │  ⌒  │   6 error · 2 warning · 11 info hidden (--verbose)
  └─────┘

agentscan v1.0.0 — touchagency

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
  "version": "1.0.0",
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

Adds `~/.claude/skills` and `~/.codex/skills` to the structural checks: a
`SKILL.md` that is malformed is malformed wherever it lives, and those findings
carry a `source: global` evidence entry so you can tell them apart. Codex skills
use the Agent Skills contract (`name` and `description` required).

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
  "skillPaths": [".agents/skills", ".claude/skills", "skills", ".cursor/skills", ".codex/skills"],
  "mcpPaths": [".mcp.json", ".claude/mcp.json", "mcp.json", ".vscode/mcp.json", ".cursor/mcp.json", ".agents/mcp_config.json", ".codex/config.toml"],
  "policyFiles": ["AGENTS.md", "CLAUDE.md"],
  "ignoreSkills": [],
  "ignoreRules": [],
  "ignoreFindings": [],
  "failOn": "never",
  "includeGlobal": false,
  "requireLock": false,
  "thresholds": {
    "skillDescriptionBytes": 16000,
    "skills": 30,
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
| `claude.agent.invalid-name` | warning | Claude agent name is not lowercase letters, numbers, and hyphens |
| `claude.agent.duplicate-name` | error | Multiple Claude agent files declare the same name |
| `claude.mcp.no-launch` | error | A Claude MCP server with neither `command` nor `url` |
| `claude.mcp.url-without-type` | error | A Claude remote MCP server with a `url` but no `type` — read as stdio and skipped |
| `vscode.mcp.no-launch` | error | A VS Code MCP server (`servers`) with neither `command` nor `url` |
| `cursor.mcp.no-launch` | error | A Cursor MCP server with neither `command` nor `url` |
| `antigravity.mcp.no-launch` | error | An Antigravity MCP server with neither `command` nor `serverUrl` |
| `codex.mcp.no-launch` | error | A Codex `[mcp_servers.*]` entry with neither `command` nor `url` |
| `gemini.mcp.no-launch` | error | A Gemini MCP server with neither `command`, `url`, nor `httpUrl` |
| `opencode.mcp.no-launch` | error | An OpenCode MCP server with neither `command` nor `url` |
| `opencode.mcp.missing-type` | error | An OpenCode MCP server missing `type: local` or `type: remote` |
| `opencode.mcp.local-without-command` | error | An OpenCode `type: local` server with no `command` |
| `opencode.mcp.remote-without-url` | error | An OpenCode `type: remote` server with no `url` |
| `opencode.mcp.invalid-launch-for-type` | error | An OpenCode server whose launch field does not match its `type` |
| `continue.mcp.no-launch` | error | A Continue MCP server with neither `command`, `url`, nor `uses` |
| `claude.hook.command-without-command` | error | A Claude `type: command` hook with no `command` |
| `claude.hook.invalid-group` | error | A Claude hook matcher group with no `hooks` array |
| `mcp.command-missing` | error | An MCP `command` that is a path-like value whose file does not exist on disk |
| `security.hardcoded-secret` | error | A token-shaped literal in MCP config (the value is never echoed back) |
| `mcp.literal-env` | warning | Secret-named `env` values that are literals instead of interpolation |
| `skill.missing-skill-md` | warning | A directory under a skill path with no `SKILL.md` |
| `claude.skill.missing-frontmatter` | warning | Claude `SKILL.md` with no `---` block |
| `claude.skill.missing-description` | info | Claude frontmatter has no `description` (Recommended) |
| `agent-skills.skill.missing-frontmatter` | error | Portable skill `SKILL.md` has no YAML frontmatter |
| `agent-skills.skill.missing-name` | error | Portable skill frontmatter has no required `name` |
| `agent-skills.skill.missing-description` | error | Portable skill frontmatter has no required `description` |
| `agent-skills.skill.invalid-name` | error | Portable skill name is not `[a-z0-9]` + hyphens |
| `agent-skills.skill.name-does-not-match-directory` | error | Portable skill `name` does not match its directory |
| `agent-skills.skill.name-too-long` | error | Portable skill name exceeds 64 characters |
| `agent-skills.skill.description-too-long` | error | Portable skill description exceeds 1024 characters |
| `skill.broken-reference` | warning | The body points at a bundled file that does not exist |
| `skill.duplicate-description` | info | Two or more skills carry an identical description (heuristic) |
| `skill.locked-not-installed` | warning | `skills-lock.json` pins a skill that is not on disk |
| `skill.not-in-lock` | info | A skill on disk that the lockfile does not track (installer policy) |
| `skill.description-budget` | info | Claude skill names + descriptions exceed the startup character budget (heuristic) |
| `skill.no-lockfile` | info | Skills present with no lockfile at all (only with `requireLock`) |
| `budget.agents-md` | info | `AGENTS.md` past a secondary 150-line hint (heuristic; not an AGENTS.md requirement) |
| `budget.claude-md` | info | `CLAUDE.md` past the official “target under 200 lines” recommendation |
| `budget.agents` | info | More agent definitions than a focused set (>8) — heuristic proxy |
| `budget.mcp` | info | More MCP servers than a tool-selection hint (>5) — heuristic proxy |
| `codex.budget.instructions` | info | Codex root→cwd `AGENTS.md` chain exceeds the default 32 KiB |
| `cursor.rule.too-large` | info | A `.cursor/rules/*.mdc` file exceeds the 500-line recommendation |

### Coverage in 1.0.0

`full` means documented locations are discovered, spec-required fields are checked, and a conformance fixture (or equivalent tests) is green. `partial` means some locations or some checks. `none` means not implemented. Official pages that could not be captured are `none`, not guessed.

| Ecosystem | instructions | skills | agents | hooks | MCP |
|-----------|--------------|--------|--------|-------|-----|
| Agent Skills | none | full | none | none | none |
| AGENTS.md | partial (nested + nearest-wins; no required fields) | none | none | none | none |
| Claude Code | partial (walk-up `CLAUDE.md`; 200-line target) | partial (native; `name` optional) | partial (walk-up `.claude/agents`) | partial (33 events; command handlers only) | full (`claude-json`) |
| Codex | partial (32 KiB chain; no invented agents TOML) | full (Agent Skills; `.codex/skills`) | none | none | full (`codex-toml`) |
| VS Code | partial (`.github` instruction files; no required fields) | none | partial (filename may be the name) | full (8 events) | full (`servers`) |
| Cursor | none | full (Agent Skills; nested `SKILL.md`) | none | none | full |
| Grok | none | none | none | none | none |
| Antigravity | none | via Agent Skills | none | none | full (`serverUrl`) |
| Gemini | none | none | none | none | full (`command` / `url` / `httpUrl`) |
| Windsurf | none | none | none | none | none (official page is global-only) |
| Kiro | none | none | none | none | none |
| Cline | none | none | none | none | none |
| Roo | none | none | none | none | none |
| Kilo | none | none | none | none | none |
| OpenCode | none | none | none | none | full (V1 and V2) |
| Junie | none | none | none | none | none |
| Continue | none | none | none | none | full (`config.yaml` + `.continue/mcpServers/*` + `uses`) |

Cursor project rules (`.cursor/rules/**/*.mdc`) are a separate surface: discovery plus `cursor.rule.too-large` at info. Claude `.claude/rules/**/*.md` is inventoried and has no published line budget.

Old 0.7 rule ids still work in `ignoreRules` and `explain` (for example `hook.missing-script` aliases `claude.hook.missing-script`).

Agent definitions are checked for structure only. An agent's frontmatter `name`
is not compared to the filename; it must simply be a valid lowercase identifier
and unique. Model identifiers and tool names
are likewise not validated: both would need a hardcoded list, which is the shape
that already shipped a false error. See [plans/003](plans/003-validate-agent-definitions.md).

`skill.broken-reference` reads the body, not just the frontmatter. It looks for
paths under the conventional bundled directories (`scripts/`, `references/`,
`assets/`, `templates/`, `examples/`) and resolves each against the skill's own
directory first, then the repo root — both bases are needed, because of 1674
references measured across 17 projects, 1645 resolved skill-relative and 12 only
at the root. Fenced code blocks are stripped first: a path in an example is
illustration, not a pointer.

### Where it looks for hooks

The Claude hooks reference lists seven places a hook can be registered. agentscan
reads the four that live inside the scanned project, plus VS Code workspace hooks:

| Registered in | Script paths resolve against |
|---|---|
| `.claude/settings.json` · `.claude/settings.local.json` | project root, `${CLAUDE_PROJECT_DIR}` |
| A plugin's `hooks/hooks.json` (a directory with `.claude-plugin/plugin.json`, or the scan root itself) | the plugin root, `${CLAUDE_PLUGIN_ROOT}` |
| `SKILL.md` frontmatter | the skill's own directory, then the project root |
| `.claude/agents/*.md` frontmatter | the agent file's directory, then the project root |
| `.github/hooks/*.json` (VS Code) | project root and the hooks directory |

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
Only `$CLAUDE_PROJECT_DIR` is expanded — other variables are left alone rather
than guessed at. Schema checks judge misconfiguration, not whether a correctly
shaped entry will start at runtime.

Spec-required checks are written against published pages, not against what
happens to appear in real projects. Two that were written the other way round
shipped as false positives — a nine-name hook-event list where the spec has 31,
and a `name` must equal the directory rule that Claude's spec explicitly
contradicts. Both are gone. Heuristics that remain (`skill.duplicate-description`,
the installer lock checks, and the size budgets other than `budget.claude-md`)
are labeled in the registry and stay at `info`.

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
- **Three hook locations are unread.** `~/.claude/settings.json`, managed policy
  settings, and installed marketplace plugins under `~/.claude/plugins` all sit
  outside the scanned project, and the docs say a plugin's install directory
  changes on every update. A hook registered in one of those, pointing at a
  missing script, is not reported.
- **Bounded reads.** A `SKILL.md` is read to 64 KB and a policy file to 100 KB,
  so `skill.broken-reference` and `policyLines` see only that much of a larger
  file. This is reported — `scan.truncated`, at `info` — rather than left
  silent, and it says nothing about the file being valid: it is, and the tools
  that read it see all of it. Reporting the cap as `config.unreadable` at
  severity error is a defect this tool shipped and [plan 019](plans/019-findings-say-true-things.md) fixed.

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
