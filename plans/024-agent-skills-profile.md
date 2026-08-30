# Plan 024: Enable the Agent Skills profile for `.agents/skills`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/checks/skills.ts src/checks/registry.ts src/discover/skills.ts tests/unit/checks.test.ts docs/spec/agent-skills.md`

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/021-spec-captures-and-provenance.md, plans/022-provider-identity-on-facts.md
- **Category**: bug
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

Discovery finds `.agents/skills` and tags it, then four checks skip it
(`missing-frontmatter`, `missing-description`, `broken-reference`,
`duplicate-description`). Codex, VS Code, Gemini, Antigravity and others load
this tree. A project with broken portable skills can get zero findings.
The Agent Skills spec **requires** `name` and `description` and a directory-matching
name — the opposite of Claude native (`docs/spec/skills.md`: name optional).

## Current state

Skip sites in `src/checks/skills.ts`: 62, 78, 97, 215 (after 022: `sourceProvider === "agent-skills"`).

Regression: `tests/unit/checks.test.ts` `"agents-runtime skills skip Claude-only structure checks"` expects `[]`.

Standing prohibition: do **not** compare Claude frontmatter `name` to the directory (`docs/spec/skills.md`, plan 003).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope**: `src/checks/skills.ts`, `src/checks/registry.ts`, `src/checks/index.ts` if a new runner is split, `docs/spec/agent-skills.md` citations, `tests/unit/checks.test.ts`, optional `tests/unit/agent-skills.test.ts`.

**Out of scope**: Claude name-vs-directory; 16k description budget on Agent Skills; MCP; check ID namespace for Claude hooks (026).

## ID table (locked)

Shared / internal-consistency (all identified skill dirs except grouping folders):

| ID | When |
|----|------|
| `skill.missing-skill-md` | no SKILL.md |
| `skill.broken-reference` | body points at missing files (warning). **Also** Agent Skills. |

Claude native (`sourceProvider === "claude"` or `unknown` under a skill path that is not Agent Skills):

| ID | Severity |
|----|----------|
| `skill.missing-frontmatter` | warning |
| `skill.missing-description` | info (Recommended) |

Agent Skills only (`sourceProvider === "agent-skills"`), all `spec-required`:

| ID | Severity | Spec |
|----|----------|------|
| `agent-skills.skill.missing-frontmatter` | error | SKILL.md must have YAML frontmatter |
| `agent-skills.skill.missing-name` | error | `name` required |
| `agent-skills.skill.missing-description` | error | `description` required |
| `agent-skills.skill.invalid-name` | error | charset / hyphen rules |
| `agent-skills.skill.name-does-not-match-directory` | error | name must equal parent dir |
| `agent-skills.skill.name-too-long` | error | > 64 chars |
| `agent-skills.skill.description-too-long` | error | > 1024 chars |

Heuristic: `skill.duplicate-description` runs on Agent Skills too, severity **info** (downgrade from warning for everyone — identical descriptions are not forbidden).

Do **not** ship `skill.body-too-large` / `skill.reference-too-deep` unless you label them `vendor-recommendation` at info and quote the “Keep your main SKILL.md under 500 lines” / “one level deep” sentences. Prefer skipping them in 0.8.0.

Name regex (Agent Skills only):

```ts
const AGENT_SKILLS_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// plus: length 1–64, not starting/ending with `-`, no `--` (the regex already forbids those)
```

Do not apply this regex to Claude agents (026).

## Steps

### Step 1: Delete the skips

Remove the four `agent-skills` continues. Apply the ID table.

### Step 2: Register new IDs

Add the seven `agent-skills.skill.*` IDs to `STRUCTURAL_CHECKS` with `provenance: "spec-required"` and `lastVerified: "2026-08-30"`. Cite `docs/spec/agent-skills.md` in a comment.

### Step 3: Budget exclusion

`checkDescriptionBudget` must skip `sourceProvider === "agent-skills"`.

### Step 4: Tests

- Replace the skip test: an Agent Skills dir with no frontmatter and a broken ref emits `agent-skills.skill.missing-frontmatter` and `skill.broken-reference` (broken-ref only if SKILL.md exists and parsed).
- Valid official-shaped skill (`name` matches dir, description present, under 64/1024) → zero Agent Skills findings.
- `name: PDF-Processing` → `invalid-name`.
- `name: other-dir` in folder `pdf` → `name-does-not-match-directory`.
- Claude skill with `name: Display Name` and no match to directory → **no** name finding.
- Claude missing description → still `skill.missing-description` at info.
- Duplicate descriptions → info.
- Sync test in `checks.test.ts` updated so declared === emitted.

Need `frontmatterName` on SkillFact (already exists). Discovery already sets it from `readFrontmatter`.

**Verify**: `bun test tests/unit/checks.test.ts`

## Done criteria

- [ ] `.agents/skills` is validated, not skipped
- [ ] Claude name-vs-directory still absent
- [ ] New IDs in registry + sync test
- [ ] `bun test`, `bun run typecheck`, `bun run build`, `bun run spec:check` exit 0

## STOP conditions

- Applying Agent Skills name-must-match-directory to `.claude/skills` or `.cursor/skills`.
- Re-introducing `skill.name-mismatch` as a Claude check.
- Official spec no longer requires name/description — recapture, do not keep 2026-08-30 quotes if the page changed.

## Maintenance notes

Cursor skills under `.cursor/skills` stay `sourceProvider: "cursor"` and use Claude-like structure checks until a Cursor skill spec is captured (031). Do not silently apply Agent Skills rules to Cursor unless the official Cursor page says they use the portable spec.
