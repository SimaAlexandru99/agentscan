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
| `--json` | JSON report |
| `--quiet` | Summary line only |
| `--verbose` | Show KEEP + info-severity findings |
| `--fail-on <level>` | `never` (default) · `warning` · `error` |
| `--global` | Also scan `~/.claude/skills` and `~/.codex/skills` (see below) |
| `--config <path>` | Config file path |
| `--rules-dir <path>` | User rules directory (default: `.agentscan/rules`) |

**v1 does not write the tree** — no `apply`, no skill delete/install. Findings may *suggest* shell commands; you run them yourself.

## Sample output

```text
agentscan v0.1.0 — touchagency

Stack: 46 deps · 54 skills · 1 mcp · 2 agents · packageManager=bun

WARN    hook:PreToolUse:.claude/hooks/protect-env.js
        rule:hook.missing-script
        PreToolUse hook points at a script that does not exist: .claude/hooks/protect-env.js
        evidence: hook PreToolUse @ …/.claude/settings.json · script .claude/hooks/protect-env.js

WARN    skill:composition-patterns
        rule:skill.name-mismatch
        Frontmatter name "vercel-composition-patterns" does not match directory "composition-patterns"
        evidence: skill …/.agents/skills/composition-patterns/SKILL.md · name vercel-composition-patterns

Summary: 8 warn · 4 info hidden (--verbose)
```

That first finding is the one worth having: a `PreToolUse` hook named
`protect-env.js` was registered and the script is gone, so the protection the
config claims has silently not been in effect.

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

Same tree → same sorted findings (stable, unique `id`s — one rule per id, so a
user rule that reuses a builtin id replaces it rather than doubling it).

### `--global`

Adds `~/.claude/skills` and `~/.codex/skills` to the structural checks: a
`SKILL.md` that is malformed is malformed wherever it lives, and those findings
carry a `source: global` evidence entry so you can tell them apart.

Lockfile checks stay project-scoped — a project lockfile cannot pin a skill that
lives in your home directory, so reporting one as "not in the lockfile" could
only ever be wrong.

`includeGlobal: true` in `.agentscanrc.json` does the same thing without the
flag.

## Exit codes

| Code | When |
|------|------|
| `0` | OK, or findings below `--fail-on` threshold (default `never` always `0` for findings) |
| `1` | Findings at/above `--fail-on` (`warning` or `error`) |
| `2` | Usage / config / load error |

## CI

```yaml
# GitHub Actions — fail the job on warning+ findings
- name: agentscan
  run: bunx agentscan check --fail-on warning --json
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
  "failOn": "never",
  "includeGlobal": false,
  "requireLock": false,
  "thresholds": {
    "skills": 30,
    "mcp": 5,
    "agentsMdLines": 150,
    "claudeMdLines": 200,
    "agents": 8
  }
}
```

Budget rules are **info** (hidden unless `--verbose`) so they do not flood default text or CI with `--fail-on warning`.

## How to add a rule

Drop a YAML file under **`.agentscan/rules/`** in the project (or pass `--rules-dir`). Builtin rules live in `src/rules/builtin/`.

Minimal rule:

```yaml
id: my.org.example-rule
description: Short human summary
when:
  all:
    - dep: better-auth
    - not:
        skillMatches:
          - better-auth*
then:
  action: add          # keep | delete | add | refresh | warn | drift
  severity: warning    # error | warning | info
  subject: "skill:better-auth"
  message: "Missing better-auth skill while better-auth is a dependency"
  reason: "Mapped dep has no matching skill"
  suggest: "Add a better-auth* skill for agent auth guidance"
```

A user rule whose `id` matches a builtin **replaces** that builtin. Use
`ignoreRules` to switch one off entirely.

Supported `when` matchers:

- `dep: <name>` with optional `gte` / `lt` semver
- `skillMatches: [patterns]` — `*` wildcard, prefix (`next-*`) or suffix (`*prisma`) only
- `packageManager: bun|npm|…`
- `policyMatches: "needle"` — plain substring, **not** a regex
- `hasConfig: <key>` — flat key on the configs fact (`shadcn`, `biome`, `ultracite`, `next`); no nested paths
- `count: { of: skills|mcp|agents|hooks, gt: N }`
- `policyLines: { file: AGENTS.md|CLAUDE.md, gt: N }`
- combinators: `all`, `not` — no `any`

**Opting into config thresholds.** `gt` is absolute. To let `.agentscanrc.json`
retune it, add `thresholdKey` naming a key under `thresholds`:

```yaml
when:
  count:
    of: skills
    gt: 30                 # default
    thresholdKey: skills   # users override via thresholds.skills
```

Without `thresholdKey` your `gt` is always respected. All five builtin budget
rules opt in; nothing rewrites a rule that did not ask for it.

**Unknown clauses do not fire and do not warn.** `when` is opaque JSON, so a
typo (`depp:` for `dep:`) silently produces a rule that never matches. Check with
`agentscan rules` that it loaded, then test against a fixture.

List what loaded:

```bash
bunx agentscan rules
```

## Builtin rules (seed)

| id | Action |
|----|--------|
| `policy.package-manager-drift` | DRIFT when policy says `npm install` but PM is bun |
| `budget.skills` | INFO when skill count > thresholds.skills (default 30) |
| `budget.mcp` | INFO when MCP count > 5 |
| `budget.agents` | INFO when agent files > 8 |
| `budget.agents-md` | INFO when AGENTS.md lines > 150 |
| `budget.claude-md` | INFO when CLAUDE.md lines > 200 |

## What it checks

Structural checks run on every `check` — they live in `src/checks/`, not in the
YAML rules, because they validate each discovered item against its own file on
disk rather than matching aggregate facts. `agentscan rules` lists them together
with the YAML rules, and `agentscan explain <id>` works for either.

| id | Severity | Catches |
|----|----------|---------|
| `config.unreadable` | error | A config file that is not valid JSON, so whatever it declares is silently not in effect |
| `hook.missing-script` | error | A registered hook whose script does not exist — it never runs |
| `hook.unknown-event` | error | A hook registered under an event name that is never dispatched |
| `mcp.no-launch` | error | An MCP server with neither `command` nor `url`; its tools are never available |
| `mcp.url-without-type` | error | A remote MCP server with a `url` but no `type` — read as stdio, fails, and is skipped |
| `mcp.hardcoded-secret` | error | A token-shaped literal in MCP config (the value is never echoed back) |
| `mcp.literal-env` | warning | Long literal `env` values that should be `${VAR}` |
| `skill.missing-skill-md` | warning | A directory under a skill path with no `SKILL.md` |
| `skill.missing-frontmatter` | warning | `SKILL.md` with no `---` block |
| `skill.missing-description` | info | Frontmatter has no `description`, so Claude will not load the skill on its own |
| `skill.locked-not-installed` | warning | `skills-lock.json` pins a skill that is not on disk |
| `skill.not-in-lock` | info | A skill on disk that the lockfile does not track — local and unpinned |
| `skill.no-lockfile` | info | Skills present with no lockfile at all (only with `requireLock`) |

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
(`name` is optional and defaults to the directory). Both are gone. When adding a
check, cite the spec line it enforces.

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
- Agent definition files under `.claude/agents/` are counted but not validated.

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
