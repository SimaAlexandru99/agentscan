# Plan 022: Put Provider identity on facts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/facts/types.ts src/discover/skills.ts src/checks/skills.ts tests/unit/checks.test.ts`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/021-spec-captures-and-provenance.md
- **Category**: tech-debt
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

`SkillFact.runtime` is `"claude" | "agents" | "unknown"` and is assigned only
from path substrings in `src/discover/skills.ts:102-106`. Checks then skip
`"agents"`. That union cannot name Cursor, Codex, or Agent Skills as a spec
profile. 024 and 025 need `sourceProvider` / `schemaProfile` on facts.

## Current state

```ts
// src/facts/types.ts:6-7
runtime?: "claude" | "agents" | "unknown";
```

```ts
// src/discover/skills.ts:102-106
const runtime: SkillFact["runtime"] =
  normalizedDir.includes("/.claude/skills") || normalizedDir.endsWith("/.claude/skills")
    ? "claude"
    : normalizedDir.includes("/.agents/skills") || normalizedDir.endsWith("/.agents/skills")
      ? "agents"
      : "unknown";
```

Checks gate on `skill.runtime !== "agents"` / `=== "agents"` in
`src/checks/skills.ts` at lines 62, 78, 97, 215.

`tests/unit/checks.test.ts` helper `skill()` defaults `path` to
`.agents/skills/${id}` and usually omits `runtime`. Existing tests therefore
depend on **undefined runtime being treated as Claude-like**, not on the path.

Do **not** replace `discoverAgentSurface` with a `ProviderAdapter` plugin system.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope**:
- `src/facts/types.ts` — add `Provider`, `Compatibility`, fields on SkillFact (and optional stubs on McpFact/AgentFact/HookFact for 025/029)
- `src/discover/skills.ts` — assign `sourceProvider` from path
- `src/checks/skills.ts` — read `sourceProvider === "agent-skills"` wherever `runtime === "agents"` is used (behavior unchanged: still skip those four checks)
- `tests/unit/checks.test.ts` — `skill()` helper default `sourceProvider: "claude"` so fixtures keep Claude-like checks; path may stay or move to `.claude/skills/`
- Exhaustive `switch` with `never` default wherever Provider is switched

**Out of scope**:
- Enabling Agent Skills checks (024)
- MCP parsers (025)
- Root signals (023)
- Check ID renames (026)

## Steps

### Step 1: Types

Add to `src/facts/types.ts` (top-level, not inline imports):

```ts
export type Provider =
  | "agent-skills"
  | "claude"
  | "codex"
  | "vscode"
  | "cursor"
  | "grok"
  | "antigravity"
  | "gemini"
  | "windsurf"
  | "kiro"
  | "cline"
  | "roo"
  | "kilo"
  | "opencode"
  | "junie"
  | "continue"
  | "unknown";

export type Compatibility = {
  sourceProvider: Provider;
  consumedBy?: Provider[];
  schemaProfile?: string;
};
```

On `SkillFact`:
- Add `sourceProvider: Provider` (required on newly built facts)
- Add optional `consumedBy?: Provider[]` and `schemaProfile?: string`
- Keep `runtime?: "claude" | "agents" | "unknown"` as a deprecated alias **only if** a one-step compile requires it. Prefer deleting `runtime` in this plan and updating all call sites.

Map: `.claude/skills` → `claude`; `.agents/skills` → `agent-skills`; `.cursor/skills` → `cursor`; else `unknown`.

### Step 2: Discovery assignment

Replace the runtime ternary with a function `providerFromSkillsDir(dir: string): Provider` using an exhaustive approach (path match, then `unknown`). Set `sourceProvider` on each `SkillFact`.

### Step 3: Checks still skip Agent Skills

Change skip conditions from `runtime === "agents"` to `sourceProvider === "agent-skills"`. Do not emit new findings.

### Step 4: Tests

- Update `skill()` default: `sourceProvider: "claude"`.
- Rewrite the skip test to set `sourceProvider: "agent-skills"` and still expect `[]`.
- Grep `runtime` under `src/` and `tests/` — no remaining SkillFact.runtime uses.

**Verify**: `bun test && bun run typecheck`

## Done criteria

- [ ] `SkillFact.runtime` is gone from `src/` and `tests/`
- [ ] Discovery tags the three path families above
- [ ] Agent Skills dirs still produce zero structure findings (until 024)
- [ ] `bun test`, `bun run typecheck`, `bun run build` exit 0

## STOP conditions

- Changing `sourceProvider` forces new public JSON fields on findings — findings must stay the same shape.
- You need a ProviderAdapter interface to compile — do not add it.

## Maintenance notes

024 deletes the skip. 025 sets `schemaProfile` on `McpFact`. Reviewers: default test helper must stay `claude` or existing fixtures will flip to Agent Skills errors.
