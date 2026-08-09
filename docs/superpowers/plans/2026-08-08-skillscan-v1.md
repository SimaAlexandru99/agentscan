# agentscan v1 Implementation Plan

> **COMPLETED / historical.** Shipped across commits `cc3fbc2`…`310b131`; the
> `- [ ]` checkboxes below were never ticked during execution. Current behavior
> lives in `README.md`, not here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a report-only CLI that inventories skills/agents/hooks/MCP against `package.json` and emits keep/delete/add/refresh/warn/drift findings.

**Architecture:** Pipeline `discover → extractFacts → loadRules → runRules → report`. Declarative YAML rules + dep→skill map. No disk writes, no network, no LLM in the check path.

**Tech Stack:** TypeScript strict, Bun (package manager + test runner), Zod, yaml parser, Node `parseArgs`. Spec: `docs/superpowers/specs/2026-08-08-agentscan-design.md`.

## Global Constraints

- TypeScript strict, no `any`
- bun only for this repo (`bun install`, `bun test`, `bun run`)
- v1 is **report only** — no `apply`, no skill install
- Default `--fail-on never`
- Finding ids stable: `${ruleId}:${subject}`
- Same tree → identical JSON (sort findings by severity, action, id)
- Rules must not execute shell
- Policy file read cap: 100_000 bytes
- Bin name: `agentscan`
- Package name: `agentscan` (fallback `agent-agentscan` only if publish blocked later)

## File map (create)

| Path | Responsibility |
|------|----------------|
| `package.json` | bin, scripts, deps |
| `tsconfig.json` | strict TS |
| `LICENSE` | MIT |
| `src/version.ts` | package version string |
| `src/cli.ts` | argv router |
| `src/config/schema.ts` | Zod config + defaults |
| `src/config/load.ts` | load `.agentscanrc.json` |
| `src/facts/types.ts` | Facts, Finding, Action, Severity |
| `src/facts/semver.ts` | parse/compare versions |
| `src/facts/extract.ts` | package.json + configs → stack facts |
| `src/discover/index.ts` | roots, skills, mcp, hooks, policy, agents |
| `src/rules/map.ts` | dep→skill patterns (data) |
| `src/rules/schema.ts` | Zod for rule YAML |
| `src/rules/load.ts` | load builtin + user rules |
| `src/rules/engine.ts` | evaluate rules → findings |
| `src/rules/builtin/*.yaml` | seed rules |
| `src/report/sort.ts` | deterministic sort |
| `src/report/text.ts` | human report |
| `src/report/json.ts` | JSON report |
| `src/report/exit-code.ts` | fail-on → exit |
| `src/commands/check.ts` | check pipeline |
| `src/commands/explain.ts` | explain finding |
| `src/commands/rules.ts` | list rules |
| `src/commands/init.ts` | write config |
| `tests/unit/*` | unit tests |
| `tests/integration/check.test.ts` | fixture end-to-end |
| `tests/fixtures/*` | four fixtures from spec |

---

### Task 1: Scaffold package

**Files:**
- Create: `package.json`, `tsconfig.json`, `LICENSE`, `src/version.ts`
- Modify: `README.md` (scripts section only at end of task)

**Interfaces:**
- Produces: runnable `bun test` (empty pass), `"type": "module"`, bin placeholder

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "agentscan",
  "version": "0.1.0",
  "description": "Inventory agent skills/agents/hooks/MCP against package.json",
  "type": "module",
  "bin": {
    "agentscan": "./src/cli.ts"
  },
  "scripts": {
    "agentscan": "bun run src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "bun run src/cli.ts check"
  },
  "engines": {
    "node": ">=20"
  },
  "license": "MIT",
  "dependencies": {
    "yaml": "^2.7.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "rootDir": ".",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write MIT `LICENSE`** (copyright Sima Alexandru, 2026) and `src/version.ts`:

```ts
export const VERSION = "0.1.0";
```

- [ ] **Step 4: Install and verify**

```bash
cd ~/projects/agentscan && bun install && bun test
```

Expected: install ok; tests exit 0 (no tests yet is fine — bun test exits 0 with "No tests found" or add empty smoke).

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock tsconfig.json LICENSE src/version.ts
git commit -m "chore: scaffold agentscan package"
```

---

### Task 2: Types + config load

**Files:**
- Create: `src/facts/types.ts`, `src/config/schema.ts`, `src/config/load.ts`
- Test: `tests/unit/config.test.ts`

**Interfaces:**
- Produces:
  - `export type Action | Severity | Finding | Facts | SkillFact | ...` in `facts/types.ts`
  - `export const defaultConfig`, `configSchema`, `type AgentscanConfig` in `config/schema.ts`
  - `export function loadConfig(root: string, configPath?: string): AgentscanConfig`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/config.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load";
import { defaultConfig } from "../../src/config/schema";

describe("loadConfig", () => {
  test("returns defaults when no rc file", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-"));
    const cfg = loadConfig(root);
    expect(cfg.failOn).toBe("never");
    expect(cfg.skillPaths).toEqual(defaultConfig.skillPaths);
  });

  test("merges .agentscanrc.json", () => {
    const root = mkdtempSync(join(tmpdir(), "agentscan-"));
    writeFileSync(
      join(root, ".agentscanrc.json"),
      JSON.stringify({ ignoreSkills: ["keep-me"], failOn: "warning" }),
    );
    const cfg = loadConfig(root);
    expect(cfg.ignoreSkills).toEqual(["keep-me"]);
    expect(cfg.failOn).toBe("warning");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
bun test tests/unit/config.test.ts
```

- [ ] **Step 3: Implement types + schema + load**

`src/facts/types.ts` — copy types from spec §7 exactly (`Facts`, `SkillFact`, `Finding`, `Action`, `Severity`, agents/hooks/mcp).

`src/config/schema.ts`:

```ts
import { z } from "zod";

export const defaultConfig = {
  skillPaths: [".agents/skills", ".claude/skills", "skills", ".cursor/skills"],
  mcpPaths: [".mcp.json", ".claude/mcp.json", "mcp.json"],
  policyFiles: ["AGENTS.md", "CLAUDE.md"],
  ignoreSkills: [] as string[],
  ignoreRules: [] as string[],
  failOn: "never" as const,
  includeGlobal: false,
};

export const configSchema = z.object({
  skillPaths: z.array(z.string()).default(defaultConfig.skillPaths),
  mcpPaths: z.array(z.string()).default(defaultConfig.mcpPaths),
  policyFiles: z.array(z.string()).default(defaultConfig.policyFiles),
  ignoreSkills: z.array(z.string()).default([]),
  ignoreRules: z.array(z.string()).default([]),
  failOn: z.enum(["never", "warning", "error"]).default("never"),
  includeGlobal: z.boolean().default(false),
});

export type AgentscanConfig = z.infer<typeof configSchema>;
```

`src/config/load.ts`: read `join(root, ".agentscanrc.json")` or `configPath`; if missing return `configSchema.parse({})`; if present `JSON.parse` then parse with schema; on invalid JSON throw Error with path (caller maps to exit 2).

- [ ] **Step 4: Run test — expect PASS**

```bash
bun test tests/unit/config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/facts/types.ts src/config tests/unit/config.test.ts
git commit -m "feat: config load and core types"
```

---

### Task 3: Semver helpers

**Files:**
- Create: `src/facts/semver.ts`
- Test: `tests/unit/semver.test.ts`

**Interfaces:**
- Produces:
  - `export function coerceVersion(range: string): string | null` — strip `^`/`~`/`>=`, take first `major.minor.patch` token
  - `export function gte(version: string, min: string): boolean`
  - `export function lt(version: string, max: string): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { coerceVersion, gte, lt } from "../../src/facts/semver";

describe("semver", () => {
  test("coerceVersion strips caret", () => {
    expect(coerceVersion("^16.3.0")).toBe("16.3.0");
    expect(coerceVersion("~1.2.3")).toBe("1.2.3");
  });

  test("gte works on major", () => {
    expect(gte("16.3.0", "16.0.0")).toBe(true);
    expect(gte("15.9.0", "16.0.0")).toBe(false);
  });

  test("lt works", () => {
    expect(lt("15.0.0", "16.0.0")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL; implement minimal comparator (split on `.`, compare numeric parts left-to-right); Run — PASS; commit**

```bash
git add src/facts/semver.ts tests/unit/semver.test.ts
git commit -m "feat: semver coerce and compare"
```

---

### Task 4: Discover + extract facts

**Files:**
- Create: `src/discover/index.ts`, `src/facts/extract.ts`
- Test: `tests/unit/extract.test.ts`
- Create fixture pieces under `tests/fixtures/next16-redundant-skill/` as needed for unit test (minimal package.json + skill folder)

**Interfaces:**
- Produces:
  - `export function resolveRoot(startDir: string): string` — walk up for package.json; throw if none
  - `export function discoverAgentSurface(root: string, config: AgentscanConfig, opts: { includeGlobal: boolean }): { skills, agents, hooks, mcp, policyFiles }`
  - `export function extractFacts(root: string, config: AgentscanConfig, opts?: { includeGlobal?: boolean }): Facts`

**Discovery rules:**
- Skills: for each `config.skillPaths` relative to root, if dir exists, each **subdirectory** is a skill (`id` = folder name). If `SKILL.md` exists, read first 4KB for optional frontmatter `name`/`description` (simple regex or line scan; no full YAML required if fragile — folder name is source of truth for id).
- MCP: for each mcp path, if file exists parse JSON; support shapes `{ mcpServers: { name: { command?: string } } }` and array-less object map; each key → `McpFact`.
- Hooks: if `.claude/settings.json` or `.claude/settings.local.json` exists, best-effort collect hook event keys under `hooks` object; unknown shapes → empty list (no throw).
- Agents: each file in `.claude/agents/*` → AgentFact; also if no dir, empty.
- Policy: read listed files if exist, truncate to 100_000 chars.
- packageManager: from `packageManager` field prefix, or `package.json` `packageManager`, else infer from lockfiles (`bun.lock`/`bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, etc.).
- configs: `components.json` → shadcn true; existence of `biome.json`/`biome.jsonc` → biome; scripts or dep `ultracite` → ultracite; `next` in deps → next config light: if `next.config.*` exists set `appRouter: true` heuristically (App Router default for modern next); optional read for `cacheComponents` via regex on file text.
- `includeGlobal`: if true, append skills from `join(homedir(), ".claude/skills")` and `join(homedir(), ".codex/skills")` with `source: "global"`.

- [ ] **Step 1: Create mini fixture + failing test**

```text
tests/fixtures/next16-redundant-skill/
  package.json          # { "name": "fix", "dependencies": { "next": "16.3.0" } }
  .agents/skills/next-cache-components/SKILL.md   # "# skill\n"
```

```ts
// tests/unit/extract.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { extractFacts } from "../../src/facts/extract";
import { loadConfig } from "../../src/config/load";

const fixture = join(import.meta.dir, "../fixtures/next16-redundant-skill");

describe("extractFacts", () => {
  test("reads next dep and skill", () => {
    const facts = extractFacts(fixture, loadConfig(fixture));
    expect(facts.dependencies.next).toBe("16.3.0");
    expect(facts.skills.some((s) => s.id === "next-cache-components")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement discover + extract; test PASS; commit**

```bash
git add src/discover src/facts/extract.ts tests/unit/extract.test.ts tests/fixtures/next16-redundant-skill
git commit -m "feat: discover agent surface and extract facts"
```

---

### Task 5: Dep→skill map + rule load

**Files:**
- Create: `src/rules/map.ts`, `src/rules/schema.ts`, `src/rules/load.ts`
- Create: `src/rules/builtin/.gitkeep` (rules added Task 6)
- Test: `tests/unit/rules-load.test.ts`

**Interfaces:**
- Produces:
  - `export type DepSkillMapEntry = { dep: string; skillPatterns: string[] }`
  - `export const DEP_SKILL_MAP: DepSkillMapEntry[]` — rows from spec §8.1
  - `export function skillMatchesPattern(skillId: string, pattern: string): boolean` — `*` suffix/prefix glob simple
  - `export function loadRules(options: { builtinDir: string; userRulesDir?: string; ignoreRules: string[] }): RuleDefinition[]`
  - `RuleDefinition` from Zod: `{ id, description?, when, then: { action, severity, subject?, message, reason?, suggest? } }`

**when schema (v1 practical shape):** store as `unknown` JSON after YAML parse, evaluate in engine (Task 6). Load validates `id` + `then.action` + `then.message` required.

- [ ] **Step 1: Write map + `skillMatchesPattern` tests**

```ts
test("glob suffix", () => {
  expect(skillMatchesPattern("better-auth-best-practices", "better-auth*")).toBe(true);
  expect(skillMatchesPattern("shadcn", "prisma*")).toBe(false);
});
```

- [ ] **Step 2: Implement map + load (empty builtin ok); empty list if dir missing; commit**

```bash
git commit -m "feat: dep-skill map and rule loader"
```

---

### Task 6: Rules engine + builtin rules

**Files:**
- Create: `src/rules/engine.ts`
- Create: `src/rules/builtin/next-redundant-cache.yaml`
- Create: `src/rules/builtin/better-auth-missing.yaml`
- Create: `src/rules/builtin/orphan-skill.yaml`
- Create: `src/rules/builtin/package-manager-drift.yaml` (optional but small: policy mentions `npm install` while packageManager bun → drift)
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Produces: `export function runRules(facts: Facts, rules: RuleDefinition[], config: AgentscanConfig): Finding[]`
- Respect `config.ignoreSkills` (skip findings whose subject skill id is ignored)
- Respect `config.ignoreRules`
- Template replace `{{matchedSkill}}`, `{{matchedSkillPath}}` in subject/message/suggest
- Sort not required here (report layer sorts)

**Engine evaluation (v1):**

Support `when.all` array of clauses:

| Clause | Meaning |
|--------|---------|
| `{ dep: "next", gte: "16.0.0" }` | dep present in dependencies∪devDependencies and coerceVersion gte |
| `{ skillMatches: ["a", "b*"] }` | any skill id matches; bind matched skill for templates |
| `{ not: { skillMatches: [...] } }` | no skill matches |
| `{ hasConfig: "shadcn" }` | facts.configs.shadcn |
| `{ policyMatches: "npm install" }` | any policy text includes string/regex |
| `{ perSkill: { orphan: true } }` | emit per skill that has no map entry matching any dep AND skill id not mentioned in policy text |

For `skillMatches` + dep rules: if multiple skills match, emit one finding per matched skill.

**Builtin YAML** — as in spec examples for next redundant + better-auth missing.

Orphan rule:

```yaml
id: skill.orphan
description: Skill with no dependency mapping and not mentioned in policy
when:
  perSkill:
    orphan: true
then:
  action: delete
  severity: warning
  subject: "skill:{{matchedSkill}}"
  message: "Orphan skill — no matching dependency and not referenced in AGENTS.md/CLAUDE.md"
  reason: "No dep→skill map hit and name not in policy files"
  suggest: "rm -rf {{matchedSkillPath}}"
```

Orphan definition: skill id does not match any `DEP_SKILL_MAP` pattern for an installed dep, AND none of the policy file texts include the skill id as substring.

- [ ] **Step 1: Unit tests with synthetic Facts objects (no fs)**

```ts
// next 16 + skill next-cache-components → finding ruleId next.redundant-cache-components-skill
// better-auth dep, no skill → add finding
// skill "random-foo" no dep → orphan delete
```

- [ ] **Step 2: Implement engine + YAML files; PASS; commit**

```bash
git commit -m "feat: rules engine and seed builtin rules"
```

---

### Task 7: Report + exit code

**Files:**
- Create: `src/report/sort.ts`, `src/report/text.ts`, `src/report/json.ts`, `src/report/exit-code.ts`
- Test: `tests/unit/report.test.ts`

**Interfaces:**
- `export function sortFindings(findings: Finding[]): Finding[]` — severity order error>warning>info, then action, then id
- `export function renderText(args: { version: string; facts: Facts; findings: Finding[]; verbose: boolean; quiet: boolean }): string`
- `export function renderJson(args: { version: string; root: string; facts: Facts; findings: Finding[] }): string` — pretty JSON; include `factsSummary: { packageManager, depCount, skillCount }` not full policy text
- `export function exitCode(findings: Finding[], failOn: "never"|"warning"|"error"): 0|1`

Exit logic:
- `never` → always 0
- `warning` → 1 if any finding severity warning or error (exclude action keep if ever emitted)
- `error` → 1 if any severity error

Text format: match spec §11 (DELETE/ADD lines, summary counts). Hide `keep` unless verbose. quiet: summary line only.

- [ ] **Step 1: Tests for sort stability + exitCode; implement; commit**

```bash
git commit -m "feat: text/json report and exit codes"
```

---

### Task 8: `check` command + CLI entry

**Files:**
- Create: `src/commands/check.ts`, `src/cli.ts`
- Test: `tests/integration/check.test.ts`

**Interfaces:**
- `export async function runCheck(options: CheckOptions): Promise<number>` returns exit code
- `CheckOptions`: `{ dir?: string; json?: boolean; quiet?: boolean; verbose?: boolean; failOn?: ...; global?: boolean; configPath?: string; rulesDir?: string }`

Pipeline inside `runCheck`:
1. `resolveRoot(dir ?? process.cwd())`
2. `loadConfig(root, configPath)` — merge CLI failOn/global over config
3. `extractFacts(root, config, { includeGlobal })`
4. `loadRules({ builtinDir: join(import.meta.dir, "../rules/builtin"), userRulesDir: rulesDir ?? join(root, ".agentscan/rules"), ignoreRules })`
5. `runRules` → `sortFindings`
6. print text or json to stdout
7. return `exitCode(...)`

CLI (`src/cli.ts`):
- Use `util.parseArgs` or `node:util` parseArgs
- Commands: `check`, `explain`, `rules`, `init`, `--help`, `--version`
- Unknown command → stderr + exit 2
- On thrown Error → stderr message + exit 2

```ts
// rough check argv
// agentscan check [dir] --json --quiet --verbose --fail-on never --global --config path --rules-dir path
```

- [ ] **Step 1: Integration test**

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCheck } from "../../src/commands/check";

const fixture = join(import.meta.dir, "../fixtures/next16-redundant-skill");

test("check finds redundant next skill as JSON", async () => {
  const code = await runCheck({ dir: fixture, json: true, failOn: "never" });
  expect(code).toBe(0);
  // capture: better to have runCheck return { code, stdout } OR spy console
});
```

Prefer `runCheck` returns `{ exitCode: number; stdout: string }` for testability; CLI prints stdout and `process.exit(exitCode)`.

- [ ] **Step 2: Implement check + cli; run**

```bash
bun run src/cli.ts check tests/fixtures/next16-redundant-skill --json
```

Expected: JSON with DELETE finding for next-cache-components.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: check command and CLI entrypoint"
```

---

### Task 9: Remaining fixtures + full integration suite

**Files:**
- Create: `tests/fixtures/better-auth-missing-skill/` (package.json with better-auth, no skills)
- Create: `tests/fixtures/orphan-skill/` (no special deps, skill `totally-orphan-xyz`)
- Create: `tests/fixtures/clean-repo/` (empty deps, no skills — or only keep-worthy none)
- Modify: `tests/integration/check.test.ts`

- [ ] **Step 1: Add fixtures**

better-auth:
```json
{ "name": "ba", "dependencies": { "better-auth": "^1.0.0" } }
```

orphan:
```json
{ "name": "or", "dependencies": {} }
```
+ `.agents/skills/totally-orphan-xyz/SKILL.md`

clean:
```json
{ "name": "clean", "dependencies": { "zod": "^3.0.0" }, "devDependencies": {} }
```
+ optional skill `zod` matching map so no orphan — or no skills at all → no findings

- [ ] **Step 2: Tests assert finding ruleIds present/absent**

```ts
test("better-auth missing → ADD", ...)
test("orphan → DELETE skill.orphan", ...)
test("clean → zero actionable findings", ...)
```

Actionable = action in delete|add|drift|refresh|warn (not keep).

- [ ] **Step 3: `bun test` all green; commit**

```bash
git commit -m "test: four fixtures integration coverage"
```

---

### Task 10: `explain`, `rules`, `init`

**Files:**
- Create: `src/commands/explain.ts`, `src/commands/rules.ts`, `src/commands/init.ts`
- Test: `tests/unit/init.test.ts`, wire CLI

**Interfaces:**
- `runExplain(findingId, options)` — re-run check pipeline on dir, find finding by id, print message+reason+evidence+suggest; exit 1 if not found
- `runRules(options)` — load rules, print `id` + description one per line
- `runInit(dir)` — write `.agentscanrc.json` with `defaultConfig` if not exists; refuse overwrite unless `--force` (add `--force` flag)

- [ ] **Step 1: Implement three commands + CLI cases; test init writes file; commit**

```bash
git commit -m "feat: explain, rules, and init commands"
```

---

### Task 11: README + smoke on a real project

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Expand README** with install (`bun add -d agentscan` / `bunx agentscan`), sample output, CI snippet:

```yaml
# optional CI
- run: bunx agentscan check --fail-on warning --json
```

How to add a rule (drop YAML in `.agentscan/rules/`). Link to design spec.

- [ ] **Step 2: Smoke (read-only) on one real repo**

```bash
bun run src/cli.ts check ~/projects/dialyx --json | head -c 2000
```

Do not apply deletes. Note if findings look sane (manual). Fix false positives only if clearly wrong (e.g. crash).

- [ ] **Step 3: Final typecheck + test**

```bash
bun run typecheck && bun test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: README usage and CI recipe"
```

---

## Spec coverage checklist (self-review)

| Spec item | Task |
|-----------|------|
| Discover skills/agents/hooks/MCP/policy | 4 |
| package.json facts + configs | 4 |
| YAML rules + engine | 5–6 |
| dep→skill map | 5 |
| Builtin next/better-auth/orphan | 6 |
| text + json report | 7 |
| exit codes + fail-on default never | 7–8 |
| check/explain/rules/init CLI | 8, 10 |
| Four fixtures | 4, 9 |
| No apply / no network | all (no task adds them) |
| Deterministic sort | 7 |
| Config file | 2, 10 |

## Placeholder scan

None intentional. Engine `when` clause table is the full v1 matcher set — do not invent extra matchers without a new task.

## Type consistency

- `Facts` / `Finding` defined Task 2; used by engine (6), report (7), check (8).
- `AgentscanConfig` from Task 2; `failOn` union matches CLI.
- `runCheck` returns `{ exitCode, stdout }` for tests; CLI is thin wrapper.

---

## Done definition

- `bun test` green  
- `bun run typecheck` green  
- `bun run src/cli.ts check tests/fixtures/next16-redundant-skill` shows DELETE  
- No `apply` command exists  
