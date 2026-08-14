<h1 align="center">agentscan</h1>

<p align="center">
  <em>Your agent config says the guard is on. The script is gone. Nothing told you.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/checks-25-111111?style=flat-square" alt="25 checks">
  <img src="https://img.shields.io/badge/tests-211%20passing-111111?style=flat-square" alt="211 tests">
  <img src="https://img.shields.io/badge/network-none-111111?style=flat-square" alt="No network">
  <img src="https://img.shields.io/badge/writes-none-111111?style=flat-square" alt="Writes nothing">
  <img src="https://img.shields.io/badge/runs%20on-node%20%C2%B7%20bun-111111?style=flat-square" alt="Node or Bun">
  <img src="https://img.shields.io/npm/v/@chimix/agentscan?style=flat-square&color=111111&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
</p>

<p align="center">
  <strong>25 checks &middot; 3.4k lines &middot; 0 network calls &middot; every check sourced to a published spec line</strong><br>
  <sub>Alpha. An earlier build reported 37 findings across 17 real projects of which <strong>25 were false</strong> — two checks had been written from what real projects looked like instead of from the spec. Both were deleted, and every check that survived is recorded in <a href="docs/spec/">docs/spec/</a> with the URL it came from and the date it was read. That story is the reason this tool exists in its current shape.</sub>
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

WARN    hook:PreToolUse:.claude/hooks/guard-destructive-bash.js
        rule:hook.missing-script
        PreToolUse hook points at a script that does not exist
        evidence: hook PreToolUse @ …/.claude/settings.json

Summary: 6 warn · 4 info hidden (--verbose) · score 40/100
```

That is the whole category: **a config file asserting something that is not true
of the filesystem**, where nothing else in your stack will ever tell you.

## How it works

No AI, no network, no heuristics. Read the config, read the disk, compare:

```
1. Discover    .claude/ .agents/ .mcp.json AGENTS.md skills-lock.json
2. Extract     immutable facts — never re-read during checking
3. Check       25 checks, each against one published spec line
4. Report      text · --json · --output prompt (handoff for a fixing agent)
```

Same tree in, same findings out, every time. It never writes to the tree it
scans and never opens a socket.

## What it will not do

It will not compare a skill's frontmatter `name` to its directory, and it will
not validate model ids or MCP tool names. All three need a hardcoded list of
valid values, with everything absent from the list reported as broken. That is
exactly how the 25 false findings happened: a hook-event list with 9 names when
the spec has 31, calling working hooks dead at severity `error`.

A check here has to point at a spec line. If it cannot, it does not ship.

## Try it in 30 seconds

Run it against any project. It reads that project, writes nothing, and never
leaves your machine:

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
an `.mcp.json`, an `AGENTS.md`. On a project with none of those it will
correctly find nothing and say so.

```bash
# what it could possibly report, before you run it
bunx @chimix/agentscan rules

# the interesting bits it hides by default
bunx @chimix/agentscan check ~/your-project --verbose

# why one specific finding fired
bunx @chimix/agentscan explain hook.missing-script:hook:PreToolUse:./x.js ~/your-project
```

`check` never opens a socket and never writes to the tree it scans. Contributing
needs **Bun** 1.1+ — the repo runs TypeScript directly and `bun run build`
bundles it for Node.

### In CI

The Action runs from its own checkout, so it uses the ref you pin rather than
whatever is on npm:

```yaml
- uses: SimaAlexandru99/agentscan@v0
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
bunx agentscan check --verbose       # include KEEP and info-severity findings
bunx agentscan check --fail-on warning
bunx agentscan check --global        # also scan global skill dirs

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
| `--verbose` | Show KEEP + info-severity findings |
| `--fail-on <level>` | `never` (default) · `warning` · `error` |
| `--fail-under <0-100>` | Fail when the score drops below this floor |
| `--global` | Also scan `~/.claude/skills` and `~/.codex/skills` (see below) |
| `--config <path>` | Config file path |

**v1 does not write the tree** — no `apply`, no skill delete/install. Findings may *suggest* shell commands; you run them yourself.

## Sample output

```text
  ┌─────┐   40/100  broken  ·  touchagency
  │ ✕ ✕ │   ██████████░░░░░░░░░░░░░░░
  │  ⌒  │   6 warn · 4 info hidden (--verbose)
  └─────┘

agentscan v0.4.0 — touchagency

Scanned: 46 deps · 54 skills · 1 mcp · 2 agents · packageManager=bun

WARN    rule:hook.missing-script  ×6
        PreToolUse hook points at a script that does not exist
          PostToolUse @ .claude/settings.json · .claude/hooks/notify-related-tests.js
          PreToolUse @ .claude/settings.json · .claude/hooks/guard-destructive-bash.js
          PreToolUse @ .claude/settings.json · .claude/hooks/protect-artists-json.js
          PreToolUse @ .claude/settings.json · .claude/hooks/protect-env.js

Summary: 6 warn · 4 info hidden (--verbose) · score 40/100 broken
```

On a terminal the header is coloured green, yellow or red and the face tracks
the score. Redirect or pipe it and you get exactly the text above, with no
escape sequences — the header box is dropped too, so `--json`, `--output
prompt`, CI logs and `--copy` are unchanged by any of this.

The `Stack:` line is orientation only — which project, how big. The summary lists
only actions that actually occurred; a clean project prints `Summary: no findings`.

JSON shape (abridged):

```json
{
  "version": "0.4.0",
  "root": "/path/to/project",
  "factsSummary": {
    "packageManager": "bun",
    "depCount": 1,
    "skillCount": 1,
    "globalSkillCount": 0
  },
  "findings": [
    {
      "id": "hook.missing-script:hook:PreToolUse:.claude/hooks/protect-env.js",
      "ruleId": "hook.missing-script",
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
carry a `source: global` evidence entry so you can tell them apart.

Lockfile checks stay project-scoped — a project lockfile cannot pin a skill that
lives in your home directory, so reporting one as "not in the lockfile" could
only ever be wrong.

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
- uses: SimaAlexandru99/agentscan@v0
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
  "skillPaths": [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  "mcpPaths": [".mcp.json", ".claude/mcp.json", "mcp.json"],
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
same strings `agentscan explain` accepts, so the value you already have from
reading the report is the value you paste:

```json
{ "ignoreFindings": ["hook.missing-script:hook:PreToolUse:./bin/wrapper"] }
```

## What it checks

Every check lives in `src/checks/` and runs on every `check`. `agentscan rules`
lists all of them with their ids; `agentscan explain <id>` details any finding.

Most validate one discovered item against its own file on disk. The five
`budget.*` entries at the bottom judge aggregate size instead —
they are all **info**, they are sourced to `docs/spec/thresholds.md`, and they
are retuned through `thresholds` in `.agentscanrc.json` rather than switched
off.

| id | Severity | Catches |
|----|----------|---------|
| `config.unreadable` | error | A config file that is not valid JSON, so whatever it declares is silently not in effect |
| `hook.missing-script` | error | A registered hook whose script does not exist — it never runs |
| `hook.unknown-event` | error | A hook registered under an event name that is never dispatched |
| `agent.missing-frontmatter` | error | An agent definition with no `---` block |
| `agent.missing-description` | error | Agent frontmatter has no `description` |
| `agent.missing-name` | error | Agent frontmatter has no `name` |
| `agent.invalid-name` | error | Agent name is not lowercase letters, numbers, and hyphens |
| `agent.duplicate-name` | error | Multiple agent files declare the same name |
| `mcp.no-launch` | error | An MCP server with neither `command` nor `url`; its tools are never available |
| `mcp.url-without-type` | error | A remote MCP server with a `url` but no `type` — read as stdio, fails, and is skipped |
| `mcp.hardcoded-secret` | error | A token-shaped literal in MCP config (the value is never echoed back) |
| `mcp.literal-env` | warning | Long literal `env` values that should be `${VAR}` |
| `skill.missing-skill-md` | warning | A directory under a skill path with no `SKILL.md` |
| `skill.missing-frontmatter` | warning | `SKILL.md` with no `---` block |
| `skill.broken-reference` | warning | The body points at a bundled file that does not exist |
| `skill.duplicate-description` | warning | Two or more skills carry an identical description, so routing between them is arbitrary |
| `skill.missing-description` | info | Frontmatter has no `description`, so Claude will not load the skill on its own |
| `skill.locked-not-installed` | warning | `skills-lock.json` pins a skill that is not on disk |
| `skill.not-in-lock` | info | A skill on disk that the lockfile does not track — local and unpinned |
| `skill.description-budget` | info | Skill names + descriptions exceed the startup character budget |
| `skill.no-lockfile` | info | Skills present with no lockfile at all (only with `requireLock`) |

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

`hook.missing-script` is deliberately conservative. A command is only resolved
when it is a single invocation with a path-like argument; shell programs
(`a && b`, `$(...)`, pipes) are skipped, because a hook written as
`[ ! -f x ] || node x` already handles the missing file and flagging it would be
a false positive. `node -e "<code>"` is never treated as a path. Only
`$CLAUDE_PROJECT_DIR` is expanded — other variables are left alone rather than
guessed at.

Checks are written against the published specs, not against what happens to
appear in real projects. Two that were written the other way round shipped as
false positives — a nine-name hook-event list where the spec has 31, and a
`name` must equal the directory rule that the spec explicitly contradicts
(`name` is optional and defaults to the directory). Both are gone.

Every assumption a check encodes is recorded in **[docs/spec/](docs/spec/)**
with its source URL, the date it was read, and an honest confidence rating.
When adding a check, add its spec line there first.

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
- Policy files are read up to 100 KB, so `policyLines` undercounts past that.

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
