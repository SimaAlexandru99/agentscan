# Plan 008: Findings say true things — parser and message defects

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e6098d..HEAD -- src/discover/index.ts src/checks/index.ts src/rules/engine.ts src/cli.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (eight small independent fixes)
- **Risk**: LOW
- **Depends on**: plans/004
- **Category**: bug
- **Planned at**: commit `8e6098d`, 2026-08-09

## Why this matters

Eight defects, each independently reproduced, that make the tool state something
false. A scanner whose findings are wrong is worse than one that finds less: the
user either fixes a file that was already correct, or is told to rotate the wrong
credential.

They are batched because each is a few lines and they share one test file each,
but every step is independent — an executor can land them one commit at a time
and stop anywhere.

## Current state

Each defect, with its reproduction:

**A. Frontmatter regex crosses the line boundary.** `src/discover/index.ts:121`
uses `/^name:\s*(.+)$/m`; `\s` matches `\n`. A `SKILL.md` with an empty `name:`
followed by `description: Descrierea reala` yields:

```
skill.name-mismatch | Frontmatter name "description: Descrierea reala" does not match directory "s"
```

`skill.missing-name` never fires, and the user is told to rename their directory
to a sentence. `:128` has the same defect for `description:`.

**B. A BOM defeats frontmatter detection.** `src/discover/index.ts:111` —
`if (!text.startsWith("---"))`. A `SKILL.md` saved with a UTF-8 BOM (default in
several Windows editors) reports `skill.missing-frontmatter` with the suggestion
to add a block that is already there. Verified: the finding fires on a file
whose frontmatter is valid.

**C. Anthropic keys are labelled as OpenAI.** `src/checks/index.ts:81` is
`/\bsk-[A-Za-z0-9_-]{16,}/` and `:86` is the `sk-ant-` pattern; `:385` uses
`.find()`, which returns the first hit. Verified: `sk-ant-…` matches the generic
pattern first, so the "Anthropic key" label is unreachable. The credential type
is the only actionable content in a finding whose advice is "treat it as leaked
and rotate" — naming the wrong provider is the worst possible error there.

**D. `$` in a skill name corrupts the finding id.** `src/rules/engine.ts:326-332`
uses `replaceAll(token, value)` with a string replacement, so `$&` in the
*replacement* is interpreted. Verified with a skill directory named `a$&b`:

```
id: custom.t:skill:a{{matchedSkill}}b
```

The placeholder is re-inserted, so `explain` can never resolve that finding.

**E. Policy line count is off by one.** `src/rules/engine.ts:276` —
`policy.text.split(/\r?\n/).length` counts the empty string after a trailing
newline. Verified: a file `wc -l` reports as 200 renders as
`AGENTS.md is long (201 lines > 150)`. Every budget rule fires one line early and
reports a number the user cannot reproduce.

**F. `hasConfig` matches `Object.prototype` members.**
`src/rules/engine.ts:120-121` does `configs[key]` with `key` from user YAML.
Verified: a rule with `hasConfig: "constructor"` fires on every project, forever,
contradicting the documented "unknown clause never matches" contract.

**G. Any file in `.claude/agents` counts as an agent.**
`src/discover/index.ts:478-489` has no extension filter. Verified: a directory
containing only `.gitkeep` and `README.md` reports `2 agents`, inflating the
`budget.agents` rule.

**H. `bun.lock` still carries the old package name.** `bun.lock:6` is
`"name": "skillscan"`; `package.json:2` is `"agentscan"`. Commit `8e6098d`
renamed the manifest without regenerating the lockfile.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0, no output   |
| Tests     | `bun test`          | all pass, 0 fail    |
| Lockfile  | `bun install`       | exit 0              |

## Scope

**In scope**: `src/discover/index.ts`, `src/checks/index.ts`,
`src/rules/engine.ts`, `bun.lock`, `tests/unit/checks.test.ts`,
`tests/unit/engine.test.ts`, `tests/integration/robustness.test.ts`.

**Out of scope**:
- New check ids. Every fix here corrects an existing finding; `STRUCTURAL_CHECKS`
  must not grow, and the sync test will tell you if it does.
- The 8 KB `SKILL_MD_CAP` truncating a long frontmatter block. Real, but it is a
  read-strategy change, not a parser fix — leave it for a separate plan.
- Replacing the regex frontmatter reader with a YAML parser. Larger call.

## Git workflow

- Branch: `advisor/008-parser-and-message-correctness`
- One commit per lettered step, conventional commits (`fix: …`).
- Do NOT push or open a PR.

## Steps

### Step A: Stop the frontmatter regexes crossing lines

Replace `\s*` with `[^\S\r\n]*` in both regexes (`src/discover/index.ts:121`,
`:128`). Also skip values that are bare YAML block indicators (`|`, `>`, `|-`,
`>-`) — those mean the real value is on following lines and this parser cannot
read it, so recording `">"` as a description is worse than recording nothing.

**Verify**: a `SKILL.md` with empty `name:` and a real `description:` emits
`skill.missing-name` and **no** `skill.name-mismatch`.

### Step B: Strip the BOM

Strip a leading `﻿` immediately after decoding in `readFrontmatter`
(`src/discover/index.ts:~102`), before the `startsWith("---")` test.

**Verify**: a `SKILL.md` written with a BOM and valid frontmatter produces no
findings.

### Step C: Order secret patterns most-specific first

Move the `sk-ant-` entry above the generic `sk-` entry in `SECRET_PATTERNS`
(`src/checks/index.ts:80-87`). Add a comment saying order is significant because
`.find()` takes the first match.

**Verify**: an MCP entry containing an Anthropic-shaped key reports the label
"Anthropic key". Confirm the matched value still never appears in the output.

### Step D: Use the callback form of `replaceAll`

In `applyTemplate` (`src/rules/engine.ts:326-332`), change all four
`replaceAll(token, value)` calls to `replaceAll(token, () => value)`, which
disables `$`-pattern interpretation in the replacement.

**Verify**: a skill directory named `a$&b` matched by a rule with
`subject: "skill:{{matchedSkill}}"` produces an id containing the literal name
and **no** `{{matchedSkill}}`.

### Step E: Fix the policy line count

In `evalPolicyLinesClause` (`src/rules/engine.ts:276`), drop a single trailing
empty element before counting (or `trimEnd()` before splitting) so the count
matches `wc -l`.

**Verify**: a 200-line `AGENTS.md` reports `200 lines`, and `budget.claude-md`
(`gt: 200`) does **not** fire on a file of exactly 200 lines.

### Step F: Guard `hasConfig` against inherited members

In `evalHasConfigClause` (`src/rules/engine.ts:116-129`), require
`Object.hasOwn(configs, key)` before reading.

**Verify**: a rule with `hasConfig: "constructor"` produces no finding; a rule
with `hasConfig: "biome"` still fires on a project containing `biome.json`.

### Step G: Only count real agent files

In `discoverAgents` (`src/discover/index.ts:478-489`), skip dotfiles and require
a `.md` extension.

**Verify**: a `.claude/agents/` containing only `.gitkeep` and `README.md`
reports `0 agents`. A directory with one `reviewer.md` reports `1`.

### Step H: Regenerate the lockfile

Run `bun install` and commit the regenerated `bun.lock`.

**Verify**: `grep -c '"name": "skillscan"' bun.lock` → 0.

### Step I: Re-run the fleet

```bash
for p in ~/projects/touchagency ~/projects/dialyx ~/projects/optimad/vreaulacurs ~/projects/asgard-react; do
  echo -n "$(basename $p): "
  bun run src/cli.ts check "$p" --json | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['findings']))"
done
```

Compare against the pre-change counts. Changes are expected — steps E and G both
reduce false positives — but every difference must be explainable by one of the
steps above. An unexplained change is a STOP condition.

**Verify**: every count delta traced to a specific step.

## Test plan

- `tests/unit/checks.test.ts` — Anthropic label (C); `.gitkeep` not an agent (G)
- `tests/unit/engine.test.ts` — `$&` template (D); 200-line boundary (E);
  `hasConfig: "constructor"` (F) and `hasConfig` on a real key still working
- `tests/integration/robustness.test.ts` — empty `name:` (A); BOM (B), both
  on-disk since they are parser behaviour

Follow the existing describe blocks in each file. Write the assertion for each
step **before** the fix and confirm it fails.

Verification: `bun test` → all pass, ≥10 new assertions.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] Each of A–H has a test that fails without its fix
- [ ] `grep -c '"name": "skillscan"' bun.lock` → 0
- [ ] `bun run src/cli.ts rules | wc -l` → 20 (no new ids)
- [ ] Every fleet count change in Step I is explained
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Step I shows a count change you cannot attribute to a specific lettered step.
- `bun run src/cli.ts rules` returns anything other than 20 ids — this plan adds
  no checks.
- Step A's tightened regex makes an existing real skill stop reporting its
  description. That would mean real files rely on the multi-line behaviour, and
  the fix needs rethinking rather than forcing.

## Maintenance notes

- `SECRET_PATTERNS` order is now load-bearing (step C). Any new prefix that is a
  superset of an existing one must go above it. The comment added in step C is
  the only thing preventing this regressing.
- The frontmatter reader is regex-based by choice. Steps A and B patch two
  concrete holes; they do not make it a YAML parser, and the next exotic scalar
  form will find a third hole. If that happens twice more, replace it with
  `Bun.YAML.parse` on the extracted block rather than patching again.
- Step G's `.md` filter assumes agent definitions are markdown. If another
  extension becomes valid, this silently under-counts — a miss, not a false
  positive, which is the right direction.
