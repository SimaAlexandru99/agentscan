# Plan 003: skillscan validates agent definition files instead of only counting them

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

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (one sub-check was measured to be a false-positive factory — see Scope)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1c9976`, 2026-08-09

## Why this matters

`.claude/agents/*.md` files are agent definitions: frontmatter declares the
agent's name, description, model, and allowed tools. A typo in `model:` or a
non-existent tool name means the agent is misconfigured, and nothing reports it.

skillscan currently reads **nothing** from these files. `discoverAgents`
(`src/discover/index.ts:451`) does zero `readFileSync` calls — it stats each
file and keeps the filename. The only thing agents feed is a count, consumed by
the `budget.agents` YAML rule.

Across 17 real projects there are 34 agent files, 9 of which declare `tools:`.
None of it is checked.

## Current state

`src/discover/index.ts:451` — the whole of what is read today:

```ts
function discoverAgents(root: string): AgentFact[] {
  const dir = join(root, ".claude", "agents");
  if (!existsSync(dir)) {
    return [];
  }
  let entries: string[];
  try {
```

…and it ends by pushing `{ name: base || name, path: filePath }`.

`src/facts/types.ts:39` — the fact is two fields:

```ts
export type AgentFact = { name: string; path: string };
```

There is already a frontmatter reader in the same file:
`readFrontmatter(skillMdPath)` at `src/discover/index.ts:93`, returning
`{ hasFrontmatter, name?, description? }`. **Reuse it**; do not write a second
YAML front-matter parser. It will need a small generalisation to also return
arbitrary scalar keys (`model`) and a list key (`tools`), or a sibling function
that shares `stripQuotes`.

`src/checks/index.ts:22` — `STRUCTURAL_CHECKS` declares every emittable id and
is guarded by a sync test in `tests/unit/checks.test.ts`.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                  | exit 0, no output   |
| Tests     | `bun test`                           | all pass, 0 fail    |
| Run it    | `bun run src/cli.ts check <dir>`     | exit 0              |

## Scope

**In scope**:
- `src/facts/types.ts` — extend `AgentFact`
- `src/discover/index.ts` — read agent frontmatter
- `src/checks/index.ts` — new checks + `STRUCTURAL_CHECKS` entries
- `tests/unit/checks.test.ts`
- `tests/fixtures/bad-agent/**` (create)
- `tests/integration/check.test.ts`
- `README.md`

**Out of scope — do NOT implement, this is measured, not a guess**:

- **Do not port `skill.name-mismatch` to agents.** For skills, frontmatter
  `name` must equal the directory name because the lockfile keys on it. For
  agents it is a *display name*: `engineering-api-platform-engineer.md` declares
  `name: API Platform Engineer`. 16 of the 34 agent files in the fleet have a
  `name` that differs from the filename, and every one inspected was
  intentional. Porting the check would ship 16 false positives.
- **Do not check `description` presence as an error.** All 34 files already have
  one; measured. Report it as `warning` if absent, do not invent stricter rules.
- `src/rules/` — not rules.

## Git workflow

- Branch: `advisor/003-validate-agent-definitions`
- Conventional commits (`feat: …`). Do NOT push or open a PR.

## Steps

### Step 1: Extend the fact

In `src/facts/types.ts:39`:

```ts
export type AgentFact = {
  name: string;
  path: string;
  hasFrontmatter: boolean;
  frontmatterName?: string;
  description?: string;
  model?: string;
  tools?: string[];
};
```

**Verify**: `bun run typecheck` fails only where `AgentFact` is constructed
(that is Step 2's job) — no other errors.

### Step 2: Read agent frontmatter during discovery

In `src/discover/index.ts`, generalise `readFrontmatter` (line 93) — or add a
sibling that shares `stripQuotes` — so it can return:

- `model`: scalar string
- `tools`: either a YAML inline list (`tools: [Read, Grep]`) or a comma
  separated scalar (`tools: Read, Grep`). Both shapes appear in the wild. Split
  on commas, trim, drop empties. Do **not** attempt full YAML block-sequence
  parsing (`tools:\n  - Read`); if the value line is empty, return `undefined`
  and let the check skip that agent rather than misparse it.

Wire it into `discoverAgents` (line 451): read the file, parse the frontmatter,
populate the new fields. Keep the existing behaviour that an unreadable file is
skipped rather than throwing.

**Verify**: `bun run typecheck` → exit 0; `bun test` → all pass (no behaviour
change yet).

### Step 3: Add the checks

In `src/checks/index.ts`, add `checkAgents(facts: Facts): Finding[]` and
register it in `runChecks` (line 419). Emit:

| id | severity | when |
|---|---|---|
| `agent.missing-frontmatter` | warning | file has no `---` block |
| `agent.missing-description` | warning | frontmatter present, no `description` |
| `agent.unknown-model` | warning | `model` present and not in the known set |
| `agent.unknown-tool` | warning | a name in `tools` is not a known tool |

Known model values: `sonnet`, `opus`, `haiku`, `fable`, `inherit`. Accept any
value containing a `-` and a digit as a pinned full model id (e.g.
`claude-haiku-4-5-20251001`) rather than guessing at the full catalogue.

Known tool names: the built-in set — `Bash`, `Edit`, `Glob`, `Grep`, `Read`,
`Task`, `Write`, `WebFetch`, `WebSearch`, `NotebookEdit`, `TodoWrite`. Accept
`*` (all tools) and any name containing `__` (MCP tools are
`mcp__server__tool`, and the server set is per-machine — unknowable here).

All four are `warning`, not `error`: an unrecognised value may mean the local
list is stale rather than that the config is wrong. Note in each `suggest` that
`ignoreRules` is the escape hatch, exactly as `hook.unknown-event` does.

Add all four ids to `STRUCTURAL_CHECKS` (line 22).

**Verify**: `bun test tests/unit/checks.test.ts` → all pass, including the
`STRUCTURAL_CHECKS stays in sync` test (extend its fixture with agents that
trigger each new id).

### Step 4: Confirm against real data — false positives are the risk

```bash
for p in ~/projects/*/ ~/projects/optimad/*/; do
  [ -d "$p/.claude/agents" ] || continue
  bun run src/cli.ts check "$p" --json 2>/dev/null | python3 -c "
import json,sys,os
try: d=json.load(sys.stdin)
except Exception: sys.exit()
f=[x for x in d['findings'] if x['ruleId'].startswith('agent.')]
if f: print(os.path.basename(d['root']), [x['ruleId'] for x in f])"
done
```

Then open every reported file by hand and confirm the finding is real.

**Expected: very few or zero.** The fleet was measured at 34 agent files with 0
missing frontmatter and 0 missing descriptions. A large result set means a
parsing bug, not a discovery.

**Verify**: every reported finding confirmed by reading the file.

### Step 5: Fixture and integration test

Create `tests/fixtures/bad-agent/` with `package.json` and
`.claude/agents/broken.md` declaring `model: gpt-4` and
`tools: Read, NotARealTool`. Add one integration test asserting both
`agent.unknown-model` and `agent.unknown-tool` appear.

**Verify**: `bun test` → all pass

### Step 6: Document

Add the four ids to the "What it checks" table in `README.md`, plus one
sentence recording *why* agent `name` is deliberately not checked against the
filename — so nobody adds it later.

**Verify**: `bun run src/cli.ts rules | grep -c '^agent\.'` → 4

## Test plan

Unit (`tests/unit/checks.test.ts`), new `describe("agent checks", …)`:

- no frontmatter → `agent.missing-frontmatter` only
- frontmatter, no description → `agent.missing-description`
- `model: opus` → nothing; `model: gpt-4` → `agent.unknown-model`
- `model: claude-haiku-4-5-20251001` → nothing (pinned-id rule)
- `tools: ["Read","Grep"]` → nothing
- `tools: ["mcp__github__list_issues"]` → nothing (MCP escape)
- `tools: ["Nope"]` → `agent.unknown-tool` naming `Nope`
- `tools: undefined` → nothing
- agent whose `name` differs from filename → **no finding** (regression guard
  for the deliberate omission)

Integration: the Step 5 fixture. Pattern to follow: the existing
`lockfile drift → both directions reported end to end` test.

Verification: `bun test` → all pass, ≥12 new assertions.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] `bun run src/cli.ts rules | grep -c '^agent\.'` → 4
- [ ] Step 4 produces only findings you have confirmed by reading the file
- [ ] A test asserts an agent with a display-style `name` is NOT reported
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Step 4 reports more than ~5 findings across the whole fleet. The measured
  baseline is near-zero; a big number means the frontmatter parsing is wrong.
- Any reported `agent.unknown-tool` turns out to be a real tool. The known-tool
  list is the weakest part of this plan — it is a snapshot of a set that grows.
  If it is wrong, widen the accept-list, do not narrow the escape hatches.
- You find yourself wanting to check that `name` matches the filename. Re-read
  the Scope section; that was measured and rejected.

## Maintenance notes

- The known-model and known-tool lists go stale as the platform adds values.
  Both fail toward `warning` plus a documented `ignoreRules` escape, the same
  contract as `hook.unknown-event`. If staleness becomes a nuisance, promote
  them to config keys rather than deleting the checks.
- `tools:` block-sequence YAML (`- Read` on its own lines) is deliberately not
  parsed. If agents in the wild start using it, that shape currently yields
  `undefined` and is skipped — a miss, not a false positive, which is the right
  direction.
- A reviewer should check the frontmatter generalisation in
  `src/discover/index.ts` most closely: it is now shared with skill parsing, and
  breaking it breaks `skill.missing-name` / `skill.name-mismatch` too. The
  existing skill tests are the guard — they must stay green.
