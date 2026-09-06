# Plan 047: Scan Roo Code Agent Skills directories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/facts/provider.ts src/config/schema.ts src/discover/index.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/046-cline-skills.md (shared `skillPaths` /
  `providerFromSkillsDir`; merge carefully if 046 is not DONE)
- **Category**: direction
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-03

## Why this matters

Roo documents Agent Skills at `.roo/skills/` and `~/.roo/skills/`, plus
`~/.agents/skills/` (already scanned as portable Agent Skills). `.roo` is a
root signal; the tree is then silent. Project skills that override globals
are the interesting case — a broken project `SKILL.md` should report.

## Current state

- `Provider` includes `"roo"`; no skill path mapping.
- `defaultConfig.skillPaths` has `.agents/skills` but not `.roo/skills`.
- `--global` already opens `~/.agents/skills`; it does not open `~/.roo/skills`.
- Page: https://docs.roocode.com/features/skills (fetched 2026-09-06) —
  SKILL.md with `name` and `description` frontmatter; progressive disclosure;
  project `.roo/skills` overrides global.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec | `bun run spec:check` | exit 0 after recording the URL |

## Scope

**In scope**: `docs/spec/roo-skills.md`; `SPEC_SURFACES`; `skillPaths`;
`schemaProfileFromSkillsDir` → agent-skills for `/.roo/skills`;
`providerFromSkillsDir` → `roo`; `--global` `~/.roo/skills`; tests; README row.

**Out of scope**: Roo MCP, custom modes, hooks (no quoted hook schema in this
audit). Do not double-scan `~/.agents/skills` as Roo.

## Git workflow

- Branch: `advisor/047-roo-skills`
- Commit: `feat: scan Roo Code Agent Skills directories`

## Steps

### Step 1: Capture `docs/spec/roo-skills.md`

Quote locations, required frontmatter, override rule (project over global).
`**Read:**` today. `spec:record` the skills URL.

**Verify**: `bun run spec:check` exits 0.

### Step 2: Wire discovery

Add `.roo/skills` to `skillPaths`. Map to Agent Skills. Global `~/.roo/skills`
under `--global` only.

**Verify**: unit test — valid `.roo/skills/pdf/SKILL.md` clean; name mismatch
errors; `--global` user skill malformed is `source: global`.

### Step 3: README coverage row

Project `.roo/skills`; `--global` `~/.roo/skills`; schema Agent Skills.

**Verify**: `bun test && bun run typecheck && bun run build && bun run spec:check`

## Test plan

`tests/unit/roo-skills.test.ts` modeled on Cline/Windsurf skill tests.

## Done criteria

- [x] Gates pass; no new `roo.hook.*` ids
- [x] `plans/README.md` updated

## STOP conditions

- Page does not require `name` matching the directory — do not apply
  `name-does-not-match-directory` without a quote.
- You are about to parse Roo MCP JSON without a capture.

## Maintenance notes

Reviewer: `.agents/skills` stays `sourceProvider: agent-skills`, not `roo`.
