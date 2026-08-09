# Plan 002: agentscan reports skills an agent cannot tell apart

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1c9976..HEAD -- src/checks/index.ts src/facts/types.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1c9976`, 2026-08-09

## Why this matters

An agent picks a skill by reading its `description`. Two skills with the same
description are indistinguishable at selection time: the agent picks by
whichever it saw first, and the other one is dead weight that still costs
context on every routing decision.

Every other check in agentscan asks "is this config file intact". This one asks
"can the config actually do its job" — which is the reason the tool exists.

Measured across 17 real projects: five pairs of skills share a byte-identical
description, including `firebase-basics` / `firebase-firestore` in two separate
projects, and `react-best-practices` / `vercel-react-best-practices`. All are
reported clean today.

## Current state

- `src/checks/index.ts` — `checkSkillStructure` (line 216) already reports a
  missing `description` (`skill.missing-description`). It iterates skills one at
  a time, so it cannot see collisions. This new check compares skills against
  each other and therefore needs its own function.
- `src/facts/types.ts:4` — `SkillFact.description` is already populated from
  frontmatter by `readFrontmatter` in `src/discover/index.ts:93`. **No new fact
  is needed** — this plan is pure `src/checks/`.
- `STRUCTURAL_CHECKS` (`src/checks/index.ts:22`) declares every emittable id and
  is guarded by a sync test.

The existing per-skill loop, for shape reference (`src/checks/index.ts:216`):

```ts
function checkSkillStructure(facts: Facts): Finding[] {
  const out: Finding[] = [];
  for (const skill of facts.skills) {
```

Repo conventions: checks are `(facts) => Finding[]`, findings are built with the
local `make()` helper, and `runChecks` (line 419) composes them by spreading
each function's result in a fixed order.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                  | exit 0, no output   |
| Tests     | `bun test`                           | all pass, 0 fail    |
| One file  | `bun test tests/unit/checks.test.ts` | all pass            |
| Run it    | `bun run src/cli.ts check <dir>`     | exit 0              |

## Scope

**In scope**:
- `src/checks/index.ts`
- `tests/unit/checks.test.ts`
- `README.md`

**Out of scope**:
- `src/discover/index.ts` — the description is already extracted; do not touch
  discovery.
- Any fuzzy / semantic similarity. Exact-match after normalisation only — see
  STOP conditions.
- `src/rules/` — not a rule.

## Git workflow

- Branch: `advisor/002-ambiguous-skill-descriptions`
- Conventional commits (`feat: …`). Do NOT push or open a PR.

## Steps

### Step 1: Add the check

In `src/checks/index.ts`, add a new function next to `checkSkillStructure`:

```ts
function checkSkillDescriptions(facts: Facts): Finding[]
```

Behaviour:

- Normalise each skill's `description` for comparison: trim, collapse internal
  whitespace to single spaces, lowercase. Skip skills with no description —
  `skill.missing-description` already covers those; do not double-report.
- Group skills by normalised description. For every group of 2+, emit **one**
  finding for the group, not one per skill.
- id: `skill.duplicate-description`
- severity: `warning`
- action: `warn`
- subject: `skills:${sortedIds.join("+")}` — deterministic, and unique per
  group so ids stay unique across the report
- message: name the colliding ids
- evidence: one entry per skill path
- reason: the agent routes on description; identical descriptions make the
  choice arbitrary
- suggest: give each skill a description that says when to pick *it* over the
  other, or delete the redundant one

Register it in `runChecks` (line 419) and add the id to `STRUCTURAL_CHECKS`
(line 22).

**Verify**: `bun run typecheck` → exit 0

### Step 2: Test

Add a `describe("skill description collisions", …)` block to
`tests/unit/checks.test.ts`, modelled on the existing
`describe("skill structure checks", …)`. Cases:

- two skills, identical description → exactly one finding, subject contains
  both ids sorted
- three skills sharing one description → still exactly one finding, all three
  ids in the subject
- descriptions differing only by trailing whitespace and case → still reported
  (normalisation works)
- two skills, different descriptions → no finding
- a skill with no description → no `skill.duplicate-description` finding
  (only the existing `skill.missing-description`)
- two separate colliding pairs → two findings, deterministic order

Also extend the existing `STRUCTURAL_CHECKS stays in sync` test fixture so the
new id is emitted by its `withLock` facts — otherwise that test fails.

**Verify**: `bun test tests/unit/checks.test.ts` → all pass

### Step 3: Confirm against real data

```bash
bun run src/cli.ts check ~/projects/optimad/optimad-calificari --json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); [print(f['subject'], '|', f['message']) for f in d['findings'] if f['ruleId']=='skill.duplicate-description']"
```

Expected: two findings — one pairing `firebase-basics` with `firebase-firestore`,
one pairing `react-best-practices` with `vercel-react-best-practices`.

Fleet-wide expectation: **5 findings across the 17 projects**. A materially
larger number means normalisation is too aggressive.

**Verify**: the command prints the two expected pairs.

### Step 4: Document

Add `skill.duplicate-description` to the "What it checks" table in `README.md`.

**Verify**: `bun run src/cli.ts rules | grep -c skill.duplicate-description` → 1

## Test plan

- Six unit cases listed in Step 2, in `tests/unit/checks.test.ts`.
- Pattern to follow: the existing `describe("skill structure checks", …)` block
  in the same file — same `baseFacts` / `skill()` helpers.
- No integration test needed: this check reads only `SkillFact.description`,
  which integration already covers via `tests/fixtures/lock-drift`.

Verification: `bun test` → all pass, ≥8 new assertions.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] `bun run src/cli.ts rules | grep -c skill.duplicate-description` → 1
- [ ] Step 3 prints exactly the two expected pairs
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- You are tempted to add fuzzy matching (Levenshtein, embeddings, "similar
  enough"). Exact-match-after-normalisation is the whole scope. Near-duplicate
  detection needs a threshold, a threshold needs tuning against real data, and
  an untuned threshold ships false positives into a report whose value is that
  everything in it is real. If exact matching turns out to catch too little,
  report that as a finding — do not invent a similarity metric.
- Fleet-wide count is far above 5 — normalisation is over-merging.

## Maintenance notes

- The subject is a joined, sorted id list so the finding id stays stable and
  unique. If a third skill joins an existing pair, the subject changes and the
  finding id changes with it — that is intended (it is a different group), but
  anything downstream that pins finding ids will see it as new.
- Deliberately not covered: descriptions that are *different strings* but
  semantically interchangeable, and descriptions that are uselessly generic
  ("Helps with the project"). Both are real problems, neither is detectable
  without a judgement call this tool should not be making.
- A reviewer should check the normalisation function, not the grouping.
