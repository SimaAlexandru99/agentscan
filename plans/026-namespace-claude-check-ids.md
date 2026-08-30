# Plan 026: Namespace Claude check IDs and split name schemas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/checks src/analyze.ts tests`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/024-agent-skills-profile.md, plans/025-mcp-profile-parsers.md
- **Category**: migration
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

IDs like `hook.unknown-event` and `mcp.url-without-type` look universal. Codex
has different hook events; Codex MCP `url` without `type` is valid. Existing
`.agentscanrc.json` `ignoreRules` must keep working through 0.8.x.

## Locked ID table

**Unprefixed (universal):**
`config.unreadable`, `scan.truncated`, `skill.missing-skill-md`,
`skill.broken-reference`, `skill.not-in-lock`, `skill.locked-not-installed`,
`skill.no-lockfile`, `skill.duplicate-description`, `skill.description-budget`,
`mcp.command-missing`, `mcp.literal-env`, `budget.*`

Rename secret check: `mcp.hardcoded-secret` → `security.hardcoded-secret` with alias.

**Claude-prefixed (emit these):**
| Old | New |
|-----|-----|
| `hook.unknown-event` | `claude.hook.unknown-event` |
| `hook.missing-script` | `claude.hook.missing-script` |
| `skill.missing-frontmatter` | `claude.skill.missing-frontmatter` |
| `skill.missing-description` | `claude.skill.missing-description` |
| `agent.missing-frontmatter` | `claude.agent.missing-frontmatter` |
| `agent.missing-description` | `claude.agent.missing-description` |
| `agent.missing-name` | `claude.agent.missing-name` |
| `agent.duplicate-name` | `claude.agent.duplicate-name` |
| `agent.invalid-name` | `claude.agent.invalid-name` |
| `mcp.no-launch` | `claude.mcp.no-launch` (only `schemaProfile === "claude-json"`) |
| `mcp.url-without-type` | `claude.mcp.url-without-type` |

Keep `agent-skills.skill.*` from 024. Keep profile-specific MCP IDs from 025.

Claude skill IDs **are** namespaced (`claude.skill.*`). Unknown-provider skills
that used Claude structure checks should emit `claude.skill.*` only when
`sourceProvider` is `claude` or `unknown` (same structure rules as today).

## Alias map

In `src/analyze.ts`, when filtering `ignoreRules`, treat a configured old id
as matching the new id. Same for `runRulesCommand` hide-if-ignored (match both).
`explain` looks up finding `id` which uses the **new** `ruleId`.

```ts
const RULE_ALIASES: Record<string, string> = {
  "hook.unknown-event": "claude.hook.unknown-event",
  // ... every Old → New row
  "mcp.hardcoded-secret": "security.hardcoded-secret",
};
```

`ignoreRules: ["hook.unknown-event"]` suppresses `claude.hook.unknown-event`.

## Current state

- Findings built via `make(ruleId, subject)` → `id = `${ruleId}:${subject}``.
- `analyze.ts:59-60` `ignoredRules.has(f.ruleId)` exact match.
- `tests/integration/public-contract.test.ts` asserts the first four registry IDs and emitted `hook.unknown-event`.
- Claude agent name regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` at `src/checks/agents.ts:66` — **keep** for Claude agents; do not replace with a no-digits Claude-only regex unless `docs/spec/agents.md` is recaptured to forbid digits. The audit asked to separate schemas, not to start failing `reviewer2`. Severity stays warning; `:` is the documented load failure.

## Scope

**In scope**: check modules, registry, analyze, rules command, all tests that mention old IDs, README examples that show `hook.missing-script`.

**Out of scope**: 0.9.0 provider hook IDs (030); changing Claude agent severity to error.

## Steps

1. Add `src/checks/aliases.ts` with the map and `canonicalRuleId(id: string): string` plus `ruleIdsMatch(configured: string, emitted: string): boolean`.
2. Switch every `make("hook.…")` / agent / claude skill / claude mcp call to the new id.
3. Update `STRUCTURAL_CHECKS` ids.
4. Wire aliases into `analyze` and `runRulesCommand`.
5. Update tests and the README killer example (`rule:claude.hook.missing-script`).
6. Add a test: config `ignoreRules: ["hook.unknown-event"]` hides `claude.hook.unknown-event`.

**Verify**: `bun test` ; `rg -n '"hook\\.(unknown-event|missing-script)"' src` returns only the alias map.

## Done criteria

- [ ] Emitted IDs match the table
- [ ] Old ignoreRules still work
- [ ] Claude agent digits still valid; Agent Skills name rules unchanged from 024
- [ ] `bun test`, `bun run typecheck`, `bun run build` exit 0

## STOP conditions

- Breaking `ignoreFindings` without a documented migration (finding ids change because they start with ruleId — that is expected; mention it in 027 README).
- Applying Agent Skills name regex to Claude agents.

## Maintenance notes

Remove aliases in a later 0.9/1.0 plan only after a changelog note. Reviewers: grep tests for old IDs.
