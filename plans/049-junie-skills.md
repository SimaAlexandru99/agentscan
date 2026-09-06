# Plan 049: Scan Junie skills without requiring `description`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/checks/skills.ts src/facts/provider.ts src/config/schema.ts src/discover/index.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (schema differs from Agent Skills on `description`)
- **Depends on**: plans/048-kilo-skills.md
- **Category**: direction
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-05

## Why this matters

Junie CLI loads `.junie/skills/<name>/SKILL.md` and `~/.junie/skills/`. The
2026-09-06 page lists `name` required and **`description` optional**. Applying
`agent-skills.skill.missing-description` (error) to a documented valid Junie
skill is a false positive — the class this repo deleted once already.

`.agents/skills` in a Junie project stays the portable Agent Skills profile
(required description). Only `.junie/skills` gets the Junie exception.

## Current state

- `Provider` includes `"junie"`; no skill path.
- Page: https://junie.jetbrains.com/docs/agent-skills.html
  - Project: `<projectRoot>/.junie/skills/<skill-name>/`
  - User: `~/.junie/skills/`
  - Also `.agents/skills` (already scanned)
  - SKILL.md required; folder without it is not a skill
  - Frontmatter: `name` required; `description` **No**
- Agent Skills checks live in `src/checks/skills.ts` and key off
  `schemaProfile === "agent-skills"`.
- `SkillSchemaProfile` (`src/facts/provider.ts` line 27) is
  `"claude" | "agent-skills" | "grok"` — Grok already has optional
  name/description. Junie is closer to Agent Skills than to Grok (name
  still required and should match the folder if the page says so — confirm).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec | `bun run spec:check` | exit 0 after recording the URL |

## Scope

**In scope**:
- `docs/spec/junie-skills.md`
- `SPEC_SURFACES`
- `src/facts/provider.ts` — `providerFromSkillsDir` → `junie` for
  `/.junie/skills`; `schemaProfileFromSkillsDir` — see locked decision
- `src/checks/skills.ts` — skip `agent-skills.skill.missing-description`
  when `sourceProvider === "junie"` **or** use a `junie` skill profile if
  that is cleaner. Locked: a Junie skill with `name` matching the directory
  and **no** `description` must emit **zero** description errors.
- `skillPaths` + `--global` `~/.junie/skills`
- Tests + README

**Out of scope**: Junie MCP (`junie-cli-mcp-configuration.html` timed out
2026-09-06 — capture later). Extension-provided skills. `--skill-location`.
Do not require description.

## Locked decision

If the live page still marks `description` optional:

- Still apply: missing SKILL.md, missing frontmatter, missing/invalid `name`,
  name-vs-directory **if quoted**, name length if quoted.
- Do **not** emit `agent-skills.skill.missing-description` for
  `sourceProvider === "junie"`.
- Do **not** create `junie.skill.missing-description` at error.

If the page was updated to require description, apply full Agent Skills and
say so in the capture.

## Git workflow

- Branch: `advisor/049-junie-skills`
- Commit: `feat: scan Junie skills without requiring description`

## Steps

### Step 1: Capture

Quote the frontmatter table. Highlight optional `description`. Quote both
skill directories. Unread: custom `--skill-location`, extensions, MCP.

**Verify**: capture quotes "optional" or "No" on description.

### Step 2: Discovery + check exception

Wire `.junie/skills`. Add a regression test:

```
.junie/skills/foo/SKILL.md
---
name: foo
---
# body
```

Expect: no `*.missing-description`. Same tree under `.agents/skills/foo/`
**does** emit `agent-skills.skill.missing-description`.

**Verify**: that pair of tests pass.

### Step 3: README + gates

**Verify**: `bun test && bun run typecheck && bun run build && bun run spec:check`

## Test plan

`tests/unit/junie-skills.test.ts`: optional description; required name;
`.agents/skills` unchanged.

## Done criteria

- [x] Gates pass
- [x] Junie skill without description is not an error
- [x] Portable `.agents/skills` without description is still an error
- [x] `plans/README.md` updated

## STOP conditions

- Page requires description — then use full Agent Skills and drop the
  exception (record the date).
- Page says `name` need not match the folder — do not ship
  `name-does-not-match-directory` for Junie.

## Maintenance notes

Reviewer: the `.agents/skills` vs `.junie/skills` split is the whole point.
Do not "simplify" by one profile.
