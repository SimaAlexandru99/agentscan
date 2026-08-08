# skillscan — Design Spec

**Date:** 2026-08-08  
**Status:** Approved (brainstorming)  
**License (target):** MIT  
**Bin name:** `skillscan`  
**Repo (canonical):** `~/projects/skillscan`

## 1. Problem

Tools like [skills.sh](https://www.skills.sh/), [autoskills.sh](https://www.autoskills.sh/), and [shadscan.com](https://www.shadscan.com/) help **install** agent skills or **audit UI code**. None systematically answer:

> Given this repo’s real stack (`package.json` + light configs), which skills / agents / hooks / MCP entries should I **keep, delete, add, or refresh**?

Without that, agent users accumulate skill debt, copy hygiene rituals across repos, and re-audit Next/biome/ultracite endlessly (“cross-repo stack hygiene cascade”).

## 2. Goal

Ship a **local, deterministic CLI** that inventories **agent surface** against **stack truth** and emits actionable findings. Same tree → same result. No LLM required in the hot path. No network required for `check`.

**One-liner:** *shadscan for agent stack hygiene* (inventory + recommend; inverse of autoskills).

## 3. Non-goals (v1)

- Writing to disk (`apply`, delete skills, install skills)
- Auto-install from skills.sh / autoskills behavior
- Fleet mode (`~/projects/*`)
- LLM-in-the-loop scoring
- Running ultracite / react-doctor / shadscan
- Framework upgrades (Next, Biome, etc.)
- Cloud account, telemetry, or remote registry fetch at runtime

## 4. Success criteria (v1)

1. On a fixture (and real Next 16 apps): flags **redundant** Next cache-related skills when `next >= 16`.
2. Flags **missing** skill when a mapped dep exists (e.g. `better-auth`) and no matching skill.
3. Flags **orphan** skills (no dep mapping, not referenced in policy files).
4. Two runs on the same tree produce identical JSON findings (stable ids, sorted output).
5. A new user runs `bunx skillscan check` and understands delete/add within 30 seconds of reading the report.

## 5. Architecture

```text
Discover → ExtractFacts → RulesEngine → Report (text | json) + exit code
```

| Module | Responsibility | Depends on |
|--------|----------------|------------|
| `discover` | Resolve project root; locate package.json, skill dirs, MCP, hooks, policy files | fs, config |
| `facts` | Immutable snapshot: deps, configs, skills, agents, hooks, mcp, policy text | discover |
| `rules` | Load builtin + user rules; evaluate against facts → findings | facts |
| `report` | Human text, JSON; exit code from `--fail-on` | findings |
| `cli` | argv, commands, wiring | all |

No network in v1 check path.

## 6. Repository layout

```text
skillscan/
  package.json
  README.md
  LICENSE
  docs/superpowers/specs/2026-08-08-skillscan-design.md
  src/
    cli.ts
    commands/check.ts
    commands/explain.ts
    commands/rules.ts
    commands/init.ts
    discover/index.ts
    facts/extract.ts
    facts/types.ts
    rules/engine.ts
    rules/load.ts
    rules/builtin/          # shipped YAML rules
    report/text.ts
    report/json.ts
    config/load.ts
  tests/
    fixtures/
      next16-redundant-skill/
      better-auth-missing-skill/
      orphan-skill/
      clean-repo/
    unit/
    integration/
```

**Runtime:** Bun preferred; Node ≥ 20 supported.  
**Language:** TypeScript strict (no `any`).  
**Deps (v1):** `zod` (config/findings), `yaml` (rules). Prefer stdlib `parseArgs` over heavy CLI frameworks.

## 7. Data model

### 7.1 Facts

```ts
type Facts = {
  root: string
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | "unknown"
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /** Optional; only if lockfile parse is cheap and reliable */
  resolvedVersions?: Record<string, string>
  scripts: Record<string, string>
  configs: {
    next?: { cacheComponents?: boolean; appRouter?: boolean }
    shadcn?: boolean
    ultracite?: boolean
    biome?: boolean
  }
  skills: SkillFact[]
  agents: AgentFact[]
  hooks: HookFact[]
  mcp: McpFact[]
  policyFiles: { path: string; text: string }[]
}

type SkillFact = {
  id: string
  path: string
  description?: string
  source: "project" | "global"
  mtimeMs?: number
  tags?: string[]
}

type McpFact = { name: string; path: string; hasCommand: boolean }
type HookFact = { name: string; path: string; event?: string }
type AgentFact = { name: string; path: string }
```

Policy files (`AGENTS.md`, `CLAUDE.md`) are size-capped (e.g. 100KB) when read.

### 7.2 Finding

```ts
type Action = "keep" | "delete" | "add" | "refresh" | "warn" | "drift"
type Severity = "error" | "warning" | "info"

type Finding = {
  id: string                 // stable: `${ruleId}:${subject}`
  ruleId: string
  action: Action
  severity: Severity
  subject: string            // e.g. skill:next-cache-components
  message: string
  reason: string
  evidence: { kind: string; value: string }[]
  suggest?: string
}
```

## 8. Rules format

Declarative YAML. Builtin rules ship with the package; users may add `.skillscan/rules/*.yaml`.

Matchers (v1):

- `dep` / version `gte` / `lt` (semver)
- `skillMatches` (name globs / list)
- `hasMcp` / `hasHook` / `hasConfig(shadcn|ultracite|biome|next)`
- `policyMatches` (regex on policy text)
- combinators: `all`, `any`, `not`
- `perSkill` helpers for orphan detection (`noDepMapping`, `notMentionedInPolicy`)

Rules **must not** execute shell.

Example:

```yaml
id: next.redundant-cache-components-skill
description: Next 16+ docs cover cache components; local skill often redundant
when:
  all:
    - dep: next
      gte: "16.0.0"
    - skillMatches:
        - next-cache-components
        - next-cache
then:
  action: delete
  severity: warning
  subject: "skill:{{matchedSkill}}"
  message: "Redundant Next cache skill — prefer node_modules/next docs"
  suggest: "rm -rf {{matchedSkillPath}}"
```

### 8.1 Seed dep → skill map

Data file (not hard-coded if-chains). Initial rows:

| Dependency / signal | Skill id patterns |
|---------------------|-------------------|
| `next` (≥16 special-cases redundancy) | `next-*` (many → delete/redundant rules) |
| `better-auth` | `better-auth*`, `best-practices` (careful scoping) |
| `@tanstack/react-query` | `tanstack-query*` |
| shadcn (`components.json` or dep) | `shadcn*` |
| `@prisma/client` / `prisma` | `prisma*` |
| `zod` | `zod*` |

Community can PR map rows and rules.

## 9. CLI contract

```text
skillscan check [dir]
  --json
  --quiet
  --verbose              # show KEEP findings
  --fail-on never|warning|error   # default: never
  --global               # also scan known user skill dirs
  --config <path>
  --rules-dir <path>

skillscan explain <findingId>
skillscan rules
skillscan init
skillscan --version | --help
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success; no findings above `--fail-on` threshold |
| 1 | Findings above threshold |
| 2 | Tool/config/IO error |

**Default `--fail-on never`:** report-friendly adoption. Document CI recipe: `--fail-on warning`.

### Default discovery paths (project)

- Skills: `.agents/skills`, `.claude/skills`, `skills`, `.cursor/skills`
- MCP: `.mcp.json`, `.claude/mcp.json`, `mcp.json`
- Policy: `AGENTS.md`, `CLAUDE.md`
- Optional global (`--global`): `~/.claude/skills`, `~/.codex/skills` (if present), marked `source: "global"`

## 10. Config (`.skillscanrc.json`)

Zod-validated. Missing file → defaults.

```json
{
  "skillPaths": [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  "mcpPaths": [".mcp.json", ".claude/mcp.json", "mcp.json"],
  "policyFiles": ["AGENTS.md", "CLAUDE.md"],
  "ignoreSkills": [],
  "ignoreRules": [],
  "failOn": "never",
  "includeGlobal": false
}
```

`skillscan init` writes this file with defaults.

## 11. Report format

### Human (default)

```text
skillscan v0.1.0 — <package name or folder>

Stack: next@16.3.0 · better-auth@… · packageManager=bun

DELETE  skill:next-cache-components
        rule:next.redundant-cache-components-skill
        Redundant Next cache skill — prefer node_modules/next docs
        evidence: dep next@16.3.0 · path .agents/skills/next-cache-components

ADD     skill:better-auth
        …

Summary: 2 delete · 1 add · 0 drift · 1 warn
```

`KEEP` hidden unless `--verbose`.

### JSON (`--json`)

```json
{
  "version": "0.1.0",
  "root": "/path",
  "factsSummary": {},
  "findings": []
}
```

Findings sorted by `(severity, action, id)` for determinism.

## 12. Discover pipeline

1. Resolve root: walk up from `dir`/cwd to nearest `package.json`; else exit 2 with clear message.
2. Load config.
3. Enumerate skill dirs (SKILL.md or skill folder convention); depth bounded.
4. Parse MCP JSON safely (structure only; never execute commands).
5. Hooks: best-effort parse of known Claude/Codex shapes; unknown → skip + optional warn.
6. Read policy files with size cap.
7. Extract facts → run rules → report.

## 13. Testing strategy

| Layer | Coverage |
|-------|----------|
| Unit | Semver matchers; rule engine on synthetic `Facts` |
| Integration | Fixtures → snapshot JSON findings |
| CLI | `check --json` exit codes + stdout |

**Minimum fixtures:**

1. `next16-redundant-skill` → DELETE finding  
2. `better-auth-missing-skill` → ADD finding  
3. `orphan-skill` → DELETE finding  
4. `clean-repo` → no actionable findings  

## 14. Open-source packaging

- MIT license  
- README: problem, install, sample output, CI snippet, “add a rule”  
- Publish name: `skillscan`; if taken, `agent-skillscan`  
- No account required  

## 15. Post-v1 (explicitly later)

| Version | Feature |
|---------|---------|
| v1.1 | `apply --only delete --dry-run` then confirm |
| v1.2 | SARIF + thin GitHub Action |
| v1.3 | Agent skill on skills.sh that shells out to CLI |
| v2 | Fleet mode; session/policy gate (anti-cascade) |

## 16. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| False-positive DELETE on intentional custom skills | `ignoreSkills`; delete is warning; no apply in v1 |
| Incomplete dep→skill map | `add` is info-only; map is data + PRs |
| Divergent MCP/hooks schemas | Best-effort parse; skip unknown |
| npm name collision | Check at publish; rename bin package if needed |

## 17. Decisions locked

| Decision | Choice |
|----------|--------|
| Product wedge | Skills inventory / prune (+ agents, hooks, MCP, policy drift) |
| v1 writes disk? | **No** — report only |
| failOn default | **never** |
| Bin / project name | **skillscan** |
| Canonical path | `~/projects/skillscan` |
| LLM in check path | **No** |

## 18. Implementation notes (for planning)

- Prefer small pure functions: `extractFacts(root) → Facts`, `runRules(facts, rules) → Finding[]`.
- Stable finding `id` is mandatory for `explain` and snapshots.
- Do not bundle network clients.
- bun as package manager for this repo (workspace owner standard).

## 19. Approval

- Brainstorming approaches: CLI-only v1 recommended; approved.  
- Detailed design sections: approved 2026-08-08 by product owner (Sima).  
- This document is the source of truth for the first implementation plan.
