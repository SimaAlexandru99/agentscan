# Plan 001: agentscan reports skill files that point at bundled files which do not exist

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e1c9976..HEAD -- src/discover/index.ts src/checks/index.ts src/facts/types.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (false positives are the failure mode — see STOP conditions)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1c9976`, 2026-08-09

## Why this matters

A `SKILL.md` routinely tells the agent to read a bundled file —
`references/concepts/tracing.md`, `scripts/report.ts`. When that file is not
there, the agent follows a dead pointer and the skill silently degrades. This is
the same failure class as `hook.missing-script`, which agentscan already reports
and which found six registered-but-missing guard hooks in one real project.

agentscan cannot see it today because it never opens the body of a `SKILL.md` —
it reads the frontmatter block and stops. Measured across 17 real projects: 1674
unique bundled-file references, **17 of them resolve to nothing**, in skills that
are otherwise well-formed and therefore currently reported as clean.

## Current state

Files involved:

- `src/discover/index.ts` — all filesystem reading. `readFrontmatter` (line 93)
  is the only thing that opens a `SKILL.md`, and it reads at most
  `SKILL_MD_CAP = 8_192` bytes (line 15, used line 97) and parses only the
  `---` block.
- `src/checks/index.ts` — structural checks. `checkSkillStructure` (line 216)
  validates frontmatter presence/name/description. `STRUCTURAL_CHECKS` (line 22)
  declares every emittable id.
- `src/facts/types.ts` — `SkillFact` (line 4) carries `hasSkillMd`,
  `hasFrontmatter`, `frontmatterName`, `description`. No body-derived data.

The fact is built in `src/discover/index.ts:159-172`:

```ts
    const fact: SkillFact = {
      id: name,
      path: skillDir,
      source,
      hasSkillMd,
      hasFrontmatter: fm.hasFrontmatter,
    };
    if (fm.description !== undefined) {
      fact.description = fm.description;
    }
    if (fm.name !== undefined) {
      fact.frontmatterName = fm.name;
    }
    skills.push(fact);
```

Repo conventions to match:

- Structural checks are plain functions `(facts) => Finding[]` in
  `src/checks/index.ts`, built with the local `make(ruleId, subject, {...})`
  helper. Follow the shape of `checkHooks` in the same file — it is the closest
  analogue (same "declared thing points at a missing file" problem).
- Discovery never throws on bad input. Unreadable/unparseable *config* is
  recorded in `facts.configErrors`; unreadable content files are skipped.
- Every new check id must be added to `STRUCTURAL_CHECKS`, or the test
  `STRUCTURAL_CHECKS stays in sync with what runChecks emits` in
  `tests/unit/checks.test.ts` fails.

**The resolution rule is measured, not assumed.** Over all 1674 references found
in the fleet:

| Resolves against | Count |
|---|---|
| the skill's own directory | 1645 (98.3%) |
| the repo root only | 12 |
| nowhere | 17 |

So a reference must be tried against **both** the skill directory and the repo
root, and only reported when neither resolves. Reporting skill-relative-only
would produce 12 false positives.

## Commands you will need

| Purpose   | Command                            | Expected on success |
|-----------|------------------------------------|---------------------|
| Install   | `bun install`                      | exit 0              |
| Typecheck | `bun run typecheck`                | exit 0, no output   |
| Tests     | `bun test`                         | all pass, 0 fail    |
| One file  | `bun test tests/unit/checks.test.ts` | all pass          |
| Run it    | `bun run src/cli.ts check <dir>`   | exit 0              |

Package manager is **bun only** — never npm or yarn.

## Scope

**In scope**:
- `src/facts/types.ts` (extend `SkillFact`)
- `src/discover/index.ts` (read the body, extract references)
- `src/checks/index.ts` (new check + `STRUCTURAL_CHECKS` entry)
- `tests/unit/checks.test.ts` (unit tests)
- `tests/unit/skill-references.test.ts` (create — extraction tests)
- `tests/fixtures/broken-reference/**` (create)
- `tests/integration/check.test.ts` (one end-to-end test)
- `README.md` (add the id to the "What it checks" table)

**Out of scope** (do NOT touch):
- `src/rules/` — the YAML rule engine. This is a structural check, not a rule;
  the engine matches aggregate facts and is the wrong shape for per-item
  validation.
- `src/report/` — output format is fine as is.
- Any `--fix` behaviour. agentscan is read-only by design ("v1 does not write
  the tree"). Report only.

## Git workflow

- Branch: `advisor/001-skill-body-references`
- Conventional commits, matching `git log`: `feat: …`, `fix: …`, `refactor: …`.
  Example from this repo: `feat: structural config checks; stop swallowing unreadable config`
- Do NOT push or open a PR.

## Steps

### Step 1: Extract references from the SKILL.md body

In `src/discover/index.ts`, add an exported pure function next to
`hookScriptPath` (it is the existing precedent for "parse a path out of text,
conservatively"):

```ts
export function skillReferences(body: string): string[]
```

Rules, derived from the measured data:

- Match relative paths under the conventional bundled directories:
  `scripts/`, `references/`, `assets/`, `templates/`, `examples/`.
- The path must have a file extension of 1–4 lowercase chars.
- Must not be preceded by a word character or `/` (so `foo/scripts/x.md` and
  `https://host/scripts/x.md` do not match).
- Return each distinct path once, in first-appearance order.
- Ignore anything inside fenced code blocks (```` ``` ````) — those are
  illustrative examples, not pointers the agent will follow.

Raise `SKILL_MD_CAP` from `8_192` to `65_536`: the body is now meaningful, and
8 KB truncates most real skills mid-document. Keep a cap — this reads every
skill in the tree.

**Verify**: `bun run typecheck` → exit 0

### Step 2: Unit-test the extractor before wiring it up

Create `tests/unit/skill-references.test.ts`. Cover, at minimum:

- `references/concepts/tracing.md` in prose → extracted
- `scripts/report.ts` in a markdown link `[x](scripts/report.ts)` → extracted
- the same path twice → returned once
- `https://example.com/scripts/x.md` → not extracted
- `node_modules/scripts/x.js` → not extracted
- a path inside a ``` fence → not extracted
- `README.md` (no bundled dir prefix) → not extracted
- empty body → `[]`

**Verify**: `bun test tests/unit/skill-references.test.ts` → all pass

### Step 3: Resolve references during discovery

Extend `SkillFact` in `src/facts/types.ts`:

```ts
  /** Bundled files the SKILL.md body points at, that resolve nowhere. */
  brokenReferences?: string[];
```

In `discoverSkillsInDir` (`src/discover/index.ts:128`), when `hasSkillMd` is
true, read the body and for each extracted reference check
`existsSync(join(skillDir, ref)) || existsSync(join(root, ref))`. Collect only
the ones where **both** fail. Set `brokenReferences` only when non-empty.

`discoverSkillsInDir` does not currently receive the repo root — thread it in as
a parameter from `discoverAgentSurface`. Global skill dirs (`~/.claude/skills`)
have no meaningful repo root; pass the project root for those too, which is
harmless because the check is "resolves in either place".

**Verify**: `bun run typecheck` → exit 0, and `bun test` → all pass (no
behaviour change yet — nothing reads the new field).

### Step 4: Add the check

In `src/checks/index.ts`, inside `checkSkillStructure` (line 216), after the
existing frontmatter checks for a skill, emit one finding per skill (not per
reference) when `skill.brokenReferences` is non-empty:

- id: `skill.broken-reference`
- severity: `warning` — the skill still loads; it is the pointers that are dead
- action: `warn`
- subject: `skill:${skill.id}`
- message: name the count and list up to three paths
- evidence: the skill path plus the missing references
- reason: explain that the agent is being sent to a file that is not there
- suggest: restore the files or remove the references

Add the entry to `STRUCTURAL_CHECKS` (line 22) with a one-line description.

**Verify**: `bun test tests/unit/checks.test.ts` → all pass, including the
sync test between `STRUCTURAL_CHECKS` and emitted ids.

### Step 5: End-to-end fixture

Create `tests/fixtures/broken-reference/` with `package.json`, one skill whose
`SKILL.md` has valid frontmatter and a body referencing:

- `references/present.md` — create this file
- `references/absent.md` — do not create it

Add one test to `tests/integration/check.test.ts` asserting the JSON report
contains exactly one `skill.broken-reference` finding naming `references/absent.md`
and not `references/present.md`.

**Verify**: `bun test` → all pass

### Step 6: Confirm against real data

```bash
bun run src/cli.ts check ~/projects/dialyx --json | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print([f['subject'] for f in d['findings'] if f['ruleId']=='skill.broken-reference'])"
```

Expected: `['skill:sentry-debug-issue']` (its body points at
`references/concepts/{crons,logging,metrics,monitors,profiling,session-replay,tracing,user-feedback}.md`,
none of which exist).

Then spot-check three skills that are *not* reported and confirm by hand that
their referenced files do exist. If any well-formed skill is falsely reported,
that is a STOP condition.

**Verify**: the command above prints the expected subject; manual spot-check clean.

### Step 7: Document

Add `skill.broken-reference` to the "What it checks" table in `README.md`, and
one sentence under it noting the resolution rule (skill dir first, then repo
root) and that fenced code blocks are ignored — the same way the hook resolution
caveat is documented there.

**Verify**: `grep -c "skill.broken-reference" README.md` → at least 1

## Test plan

New tests:

- `tests/unit/skill-references.test.ts` — the eight extraction cases in Step 2.
- `tests/unit/checks.test.ts` — a skill with `brokenReferences: ["a.md"]` emits
  exactly one `skill.broken-reference`; a skill with `brokenReferences`
  undefined or `[]` emits none. Model these on the existing
  `describe("skill structure checks", …)` block in the same file.
- `tests/integration/check.test.ts` — the fixture case from Step 5. Model on the
  existing `lockfile drift → both directions reported end to end` test.

Verification: `bun test` → all pass, with at least 11 new assertions.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] `bun run src/cli.ts rules | grep -c skill.broken-reference` → 1
- [ ] Step 6 reports `skill:sentry-debug-issue` for dialyx
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Step 6 reports a skill whose referenced files you can confirm exist — the
  resolution rule is wrong and reporting it would ship false positives. This is
  the single most important failure mode of this plan: a wrong "your skill is
  broken" is worse than the check not existing.
- The reference count on a real project explodes (say >50 in one repo). The
  measured expectation is 17 across 17 projects; an order-of-magnitude miss
  means the extractor is matching prose, not pointers.
- Raising `SKILL_MD_CAP` makes `bun run src/cli.ts check ~/projects/touchagency`
  take more than ~2s.

## Maintenance notes

- The bundled-directory list (`scripts/`, `references/`, `assets/`,
  `templates/`, `examples/`) is a convention, not a spec. If skills start using
  another directory name, references under it will be silently unchecked — that
  is the intended failure direction (miss rather than false-positive).
- The 12 references that resolve only at repo root are the reason for the
  two-base lookup. If a future change makes resolution skill-relative only,
  those become false positives.
- A reviewer should scrutinise the extraction regex more than the check itself:
  the check is trivial, the extractor is where false positives come from.
- Deliberately deferred: no `--fix`. Restoring a missing file is not mechanical,
  and deleting the reference may not be what the author wants.
