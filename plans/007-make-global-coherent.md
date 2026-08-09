# Plan 007: `--global` and `includeGlobal` produce output a user can act on

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e6098d..HEAD -- src/cli.ts src/analyze.ts src/checks/index.ts src/report/text.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW–MED — changes what `--global` reports, which is currently noise
- **Depends on**: plans/004
- **Category**: bug
- **Planned at**: commit `8e6098d`, 2026-08-09

## Why this matters

Two independent defects make a documented feature useless.

**The config key does nothing.** Reproduced:

```
{"includeGlobal": true} in .agentscanrc.json  →  skillCount: 0
--global on the command line                  →  skillCount: 22
```

`agentscan init` writes `includeGlobal` into the user's config file, the README
documents it, and zod validates it — and it is discarded on every code path.

**The flag that does work produces noise.** On this repo, `--global` yields 22
`skill.not-in-lock` findings, every one pointing at `~/.claude/skills/…` or
`~/.codex/skills/…`, each suggesting the user "install it through the skills
tool so it gets pinned" — advice that would put a global skill into a project
lockfile. A project lockfile cannot pin a global skill, so none of these can
ever be true.

`SkillFact.source: "project" | "global"` exists precisely to tell them apart and
is read by nothing except the dedupe helper.

## Current state

**Defect 1** — `src/cli.ts:64`:

```ts
        global: { type: "boolean", default: false },
```

With `default: false`, `values.global` is `false` (never `undefined`) when the
flag is absent. `src/analyze.ts:46` then always spreads it over the loaded
config:

```ts
    ...(options.global !== undefined ? { includeGlobal: options.global } : {}),
```

and `src/analyze.ts:49`'s `options.global ?? config.includeGlobal` resolves
`false ?? true` → `false`.

Note the contrast: `failOn` at `src/cli.ts:63` has **no** `default`, so the same
`!== undefined` guard works correctly for it. The intended contract is
"undefined means unspecified"; only `global` breaks it.

**Defect 2** — `src/checks/index.ts:324-340`, `checkLockIntegrity` iterates
`facts.skills` with no source filter, while `src/discover/index.ts:584-592`
appends global skills to that same array:

```ts
    skills.push(
      ...discoverSkillsInDir(join(home, ".claude", "skills"), "global", configErrors),
    );
```

`src/facts/types.ts:8` declares `source`; `grep -rn "\.source" src/` shows its
only reader is `dedupeSkillsById` (`src/discover/index.ts:609-620`).

`src/report/text.ts:80` (`formatStack`) prints one undifferentiated `N skills`,
and `src/report/json.ts` `factsSummary.skillCount` likewise, so a reader cannot
tell how many of them are even in the project.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                       | exit 0, no output   |
| Tests     | `bun test`                                | all pass, 0 fail    |
| Run it    | `bun run src/cli.ts check . --global`     | exit 0              |

## Scope

**In scope**: `src/cli.ts`, `src/checks/index.ts`, `src/report/text.ts`,
`src/report/json.ts`, `tests/unit/checks.test.ts`, `tests/unit/report.test.ts`,
one integration test, `README.md`.

**Out of scope**:
- Removing `--global`. It is a documented feature; this plan makes it work.
- Changing which directories are scanned (`~/.claude/skills`, `~/.codex/skills`).
- Adding a new check id. This plan narrows an existing check and adds reporting
  detail; `STRUCTURAL_CHECKS` should not grow.

## Git workflow

- Branch: `advisor/007-make-global-coherent`
- Conventional commits (`fix: …`). Do NOT push or open a PR.

## Steps

### Step 1: Let the config key work

Remove `default: false` from the `global` option in `src/cli.ts:64` so an absent
flag yields `undefined` and the existing `?? config.includeGlobal` precedence in
`analyze.ts` does what it was written to do.

Check every read of `values.global` still typechecks — it becomes
`boolean | undefined`. `src/cli.ts:115` and `:130` pass it straight through to
options typed `global?: boolean`, so this should be clean.

**Verify**:
```
echo '{"includeGlobal":true}' > /tmp/g/.agentscanrc.json
bun run src/cli.ts check /tmp/g --json | grep -o '"skillCount": [0-9]*'
```
→ a non-zero count, matching what `--global` produces.

### Step 2: Scope lock-integrity checks to project skills

In `checkLockIntegrity` (`src/checks/index.ts:324`), filter `facts.skills` to
`source === "project"` before both the `skill.not-in-lock` loop and the
`skill.no-lockfile` count. The `skill.locked-not-installed` direction reads
`facts.lockedSkills` against on-disk ids — restrict its `onDisk` set to project
skills too, or a global skill sharing a name would mask a genuinely missing
install.

Leave `checkSkillStructure` applying to global skills: a malformed `SKILL.md` is
malformed wherever it lives, and that is actionable.

**Verify**: `bun run src/cli.ts check . --global --json` → zero
`skill.not-in-lock` findings whose evidence path is under `$HOME`.

### Step 3: Make the counts distinguishable

In `formatStack` (`src/report/text.ts:80`), when any skill has
`source === "global"`, render the split — for example
`23 skills (1 project + 22 global)`. When there are none, keep today's
`N skills` exactly.

In `src/report/json.ts`, add `globalSkillCount` alongside `skillCount` (leave
`skillCount` as the total so existing consumers do not break).

**Verify**: without `--global`, the `Stack:` line is byte-identical to before.
With `--global`, it shows the split.

### Step 4: Add source to evidence for global skills

Where a structural check emits a finding for a skill with `source === "global"`,
add an evidence entry `{ kind: "source", value: "global" }` so a reader scanning
the report can tell at a glance that the file is outside the project.

**Verify**: `bun run src/cli.ts check . --global --json` → every finding whose
evidence path is under `$HOME` also carries a `source: global` evidence entry.

### Step 5: Document it

Update the `--global` rows in `README.md` (usage block and flag table) to say
what it does and does not do: it adds global skill directories to the structural
checks; lockfile checks stay project-scoped because a project lockfile cannot
pin a global skill.

**Verify**: `grep -c "project lockfile cannot pin" README.md` → 1.

## Test plan

`tests/unit/checks.test.ts`:

- a global skill absent from the lockfile → no `skill.not-in-lock`
- a project skill absent from the lockfile → still one `skill.not-in-lock`
- a global skill with no frontmatter → still `skill.missing-frontmatter`
  (structural checks are not scoped)
- `skill.no-lockfile` counts only project skills

`tests/unit/report.test.ts`:

- facts with only project skills → `Stack:` line unchanged from today
- facts with both → the split renders

Integration: a temp project with `.agentscanrc.json` containing
`{"includeGlobal": true}` and no flag → the run scans global dirs. Guard this
one: it reads the real `$HOME`, so assert on *behaviour* (count > project count)
rather than on a specific number, or the test breaks on another machine.

Verification: `bun test` → all pass, ≥8 new assertions.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] `{"includeGlobal":true}` with no flag scans global dirs
- [ ] `check . --global` emits zero `skill.not-in-lock` for paths under `$HOME`
- [ ] Without `--global`, text output is byte-identical to before this plan
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Removing the `parseArgs` default breaks an unrelated code path — that would
  mean something reads `values.global` expecting a boolean, which the audit did
  not find; report it rather than reintroducing the default.
- Any test you write asserts an absolute skill count from the real `$HOME`.
  That is machine-dependent and will fail for the next person.
- Scoping the lock checks removes a finding on a *project* skill. It must not.

## Maintenance notes

- `SkillFact.source` now has real readers. Any new check iterating
  `facts.skills` must decide explicitly whether it applies to global skills;
  say so in the check's comment.
- `skillCount` in JSON stays the total for backward compatibility. If a future
  version wants it to mean project-only, that is a breaking change to announce.
- The deeper product question — what is `--global` *for*, auditing your own
  machine or explaining why a project sees a skill it does not own — is not
  settled by this plan. It makes the current answer coherent; it does not pick
  a different one.
