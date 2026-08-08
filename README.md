# skillscan

Deterministic CLI: inventory agent **skills / agents / hooks / MCP** against `package.json` and recommend keep / delete / add / refresh.

> *shadscan for agent stack hygiene* — inverse of autoskills (report only in v1; no auto-install).

**Spec:** [docs/superpowers/specs/2026-08-08-skillscan-design.md](docs/superpowers/specs/2026-08-08-skillscan-design.md)

## Install

```bash
# from this repo (not published yet)
bun run src/cli.ts check

# after publish
bun add -d skillscan
bunx skillscan check
```

Requires **Bun** (v1.1+). Bin is `./src/cli.ts` via bun — not a Node-built binary in v1. No network on the `check` path.

## Usage

```bash
bunx skillscan check                 # text report (cwd)
bunx skillscan check ./my-app        # explicit root
bunx skillscan check --json          # machine-readable
bunx skillscan check --quiet         # summary only
bunx skillscan check --verbose       # include KEEP + info (orphans)
bunx skillscan check --fail-on warning
bunx skillscan check --global        # also scan global skill dirs

bunx skillscan explain <findingId>   # detail one finding
bunx skillscan rules                 # list loaded rule ids
bunx skillscan init                  # write .skillscanrc.json
```

Flags for `check`:

| Flag | Meaning |
|------|---------|
| `--json` | JSON report |
| `--quiet` | Summary line only |
| `--verbose` | Show KEEP + info-severity findings (e.g. orphans) |
| `--fail-on <level>` | `never` (default) · `warning` · `error` |
| `--global` | Include global skill directories |
| `--config <path>` | Config file path |
| `--rules-dir <path>` | User rules directory (default: `.skillscan/rules`) |

**v1 does not write the tree** — no `apply`, no skill delete/install. Findings may *suggest* shell commands; you run them yourself.

## Sample output

```text
skillscan v0.1.0 — next16-redundant-skill

Stack: next@16.3.0 · packageManager=unknown

DELETE  skill:next-cache-components
        rule:next.redundant-cache-components-skill
        Redundant with Next 16+ framework docs (not a security issue)
        evidence: dep next@16.3.0 · skill …/.agents/skills/next-cache-components

Summary: 1 delete · 0 add · 0 refresh · 0 drift · 0 warn
```

JSON shape (abridged):

```json
{
  "version": "0.1.0",
  "root": "/path/to/project",
  "factsSummary": {
    "packageManager": "bun",
    "depCount": 1,
    "skillCount": 1
  },
  "findings": [
    {
      "id": "next.redundant-cache-components-skill:skill:next-cache-components",
      "ruleId": "next.redundant-cache-components-skill",
      "action": "delete",
      "severity": "warning",
      "subject": "skill:next-cache-components",
      "message": "Redundant with Next 16+ framework docs (not a security issue)",
      "reason": "next >= 16 documents cache components in framework docs",
      "evidence": [{ "kind": "dep", "value": "next@16.3.0" }],
      "suggest": "rm -rf …/next-cache-components"
    }
  ]
}
```

Same tree → same sorted findings (stable `id`s).

## Exit codes

| Code | When |
|------|------|
| `0` | OK, or findings below `--fail-on` threshold (default `never` always `0` for findings) |
| `1` | Findings at/above `--fail-on` (`warning` or `error`) |
| `2` | Usage / config / load error |

## CI

```yaml
# GitHub Actions — fail the job on warning+ findings
- name: skillscan
  run: bunx skillscan check --fail-on warning --json
```

Or with a local checkout of this repo:

```bash
bun run src/cli.ts check --fail-on warning --json
```

Default `failOn` is `never` so local runs stay non-blocking until you opt in.

## Config

Optional `.skillscanrc.json` (create with `skillscan init`):

```json
{
  "skillPaths": [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  "mcpPaths": [".mcp.json", ".claude/mcp.json", "mcp.json"],
  "policyFiles": ["AGENTS.md", "CLAUDE.md"],
  "ignoreSkills": [],
  "ignoreRules": [],
  "failOn": "never",
  "includeGlobal": false,
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

Drop a YAML file under **`.skillscan/rules/`** in the project (or pass `--rules-dir`). Builtin rules live in `src/rules/builtin/`.

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

Useful `when` matchers (v1):

- `dep: <name>` with optional `gte` / `lt` semver
- `skillMatches: [patterns]` (`*` wildcard)
- `packageManager: bun|npm|…`
- `policyMatches: "substring"`
- `hasConfig: <key>`
- `perSkill: { orphan: true }`
- `count: { of: skills|mcp|agents|hooks, gt: N }` (gt overridden by `thresholds` when of is skills/mcp/agents)
- `policyLines: { file: AGENTS.md|CLAUDE.md, gt: N }`
- combinators: `all`, `not` (v1 — no `any` yet)

List what loaded:

```bash
bunx skillscan rules
```

## Builtin rules (seed)

| id | Action |
|----|--------|
| `next.redundant-cache-components-skill` | DELETE redundant Next cache skills when `next >= 16` |
| `better-auth.missing-skill` | ADD when `better-auth` dep lacks a matching skill |
| `skill.orphan` | INFO/WARN unmapped skills (collapsed to ORPHAN line in default text) |
| `policy.package-manager-drift` | DRIFT when policy says `npm install` but PM is bun |
| `budget.skills` | INFO when skill count > thresholds.skills (default 30) |
| `budget.mcp` | INFO when MCP count > 5 |
| `budget.agents` | INFO when agent files > 8 |
| `budget.agents-md` | INFO when AGENTS.md lines > 150 |
| `budget.claude-md` | INFO when CLAUDE.md lines > 200 |

## Development

```bash
bun install
bun run typecheck
bun test
bun run src/cli.ts check tests/fixtures/next16-redundant-skill
```

| Script | Command |
|--------|---------|
| `skillscan` | `bun run src/cli.ts` |
| `typecheck` | `tsc --noEmit` |
| `test` | `bun test` |
| `check` | `bun run src/cli.ts check` |

## License

MIT
