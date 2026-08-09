# agentscan

Deterministic CLI that finds **issues in a project's agent configuration** — skills, `skills-lock.json`, hooks, MCP servers, agent definitions and policy files.

It reports broken and inconsistent config: a hook whose script is gone, an MCP server that can never start, a credential pasted into a config file, a skill whose frontmatter name disagrees with its directory, a lockfile that disagrees with what is installed.

> *shadscan for agent stack hygiene* — inverse of autoskills (report only in v1; no auto-install).

**This README is the source of truth for current behavior.** The docs under
`docs/superpowers/specs/` are the original design and have been **superseded** —
several decisions changed during implementation: Bun-only runtime, the dep→skill
map and its "orphan" heuristic removed in favour of `skills-lock.json`, budget
rules added, and structural config checks added. Read them as history.

## Install

```bash
# from this repo (not published yet)
bun run src/cli.ts check

# after publish
bun add -d agentscan
bunx agentscan check
```

Requires **Bun** (v1.1+). Bin is `./src/cli.ts` via bun — not a Node-built binary in v1. No network on the `check` path.

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
| `--quiet` | Summary line only |
| `--verbose` | Show KEEP + info-severity findings |
| `--fail-on <level>` | `never` (default) · `warning` · `error` |
| `--fail-under <0-100>` | Fail when the score drops below this floor |
| `--global` | Also scan `~/.claude/skills` and `~/.codex/skills` (see below) |
| `--config <path>` | Config file path |

**v1 does not write the tree** — no `apply`, no skill delete/install. Findings may *suggest* shell commands; you run them yourself.

## Sample output

```text
agentscan v0.1.0 — touchagency

Stack: 46 deps · 54 skills · 1 mcp · 2 agents · packageManager=bun

WARN    hook:PreToolUse:.claude/hooks/guard-destructive-bash.js
        rule:hook.missing-script
        PreToolUse hook points at a script that does not exist: .claude/hooks/guard-destructive-bash.js
        evidence: hook PreToolUse @ …/.claude/settings.json · script .claude/hooks/guard-destructive-bash.js

WARN    hook:PreToolUse:.claude/hooks/protect-artists-json.js
        rule:hook.missing-script
        PreToolUse hook points at a script that does not exist: .claude/hooks/protect-artists-json.js
        evidence: hook PreToolUse @ …/.claude/settings.json · script .claude/hooks/protect-artists-json.js

Summary: 6 warn · 4 info hidden (--verbose) · score 40/100
```

Both of these are worth having: a `PreToolUse` hook named
`guard-destructive-bash.js` is registered and its script is gone, so the guard
the config claims has silently not been in effect.

The `Stack:` line is orientation only — which project, how big. The summary lists
only actions that actually occurred; a clean project prints `Summary: no findings`.

JSON shape (abridged):

```json
{
  "version": "0.1.0",
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
`budget.*` / `policy.*` entries at the bottom judge aggregate size instead —
they are all **info**, they are sourced to `docs/spec/thresholds.md`, and they
are retuned through `thresholds` in `.agentscanrc.json` rather than switched
off.

| id | Severity | Catches |
|----|----------|---------|
| `config.unreadable` | error | A config file that is not valid JSON, so whatever it declares is silently not in effect |
| `hook.missing-script` | error | A registered hook whose script does not exist — it never runs |
| `hook.unknown-event` | error | A hook registered under an event name that is never dispatched |
| `agent.missing-frontmatter` | warning | An agent definition with no `---` block |
| `agent.missing-description` | info | Agent frontmatter has no `description`, so it will not be dispatched on its own |
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
is a display name — 16 of 34 real files declare one that differs from the
filename, and nothing keys on the filename — so it is deliberately not compared,
and a test guards against re-adding that check. Model identifiers and tool names
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
- **Bun only.** `import.meta.dir` / `import.meta.main`; it will not run on Node.
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

## License

MIT
