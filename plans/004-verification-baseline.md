# Plan 004: `bun test` and `bun run typecheck` run automatically on every push

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e6098d..HEAD -- package.json tests/ README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none — and every other plan depends on this one
- **Category**: dx
- **Planned at**: commit `8e6098d`, 2026-08-09

## Why this matters

There is already a one-command answer to "does this work": `bun run typecheck`
and `bun test`. Nothing runs them. There is no `.github/`, no git hook, no
pre-commit config. A red suite can be committed and nobody finds out.

This is first because the audit that produced plans 004–008 found nine defects a
passing suite would not have caught on its own — but every fix in those plans is
verified by these two commands, and without automation their green is a claim
rather than a fact. The rubric this audit follows floats verification baselines
above everything else for exactly this reason.

Two things are broken today that this plan also repairs: the README's own
developer smoke command points at a fixture deleted in commit `e1c9976`, and
`tests/smoke.test.ts` asserts a hardcoded version string that will fail on the
first release.

## Current state

- `package.json` — has the scripts and nothing invokes them:

```json
  "scripts": {
    "preinstall": "node -e \"...bun check...\"",
    "agentscan": "bun run src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "bun run src/cli.ts check"
  },
```

- `README.md:289` — the documented developer smoke command:
  `bun run src/cli.ts check tests/fixtures/next16-redundant-skill`.
  That fixture was deleted in `e1c9976`; `tests/fixtures/` now contains only
  `clean-repo/` and `lock-drift/`.
- `README.md:123-131` — ships a GitHub Actions recipe for *consumers* of
  agentscan while this repo has no workflow of its own.
- `tests/smoke.test.ts` — the entire file:

```ts
import { describe, expect, test } from "bun:test";
import { VERSION } from "../src/version";

describe("scaffold", () => {
  test("VERSION is 0.1.0", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
```

  `src/version.ts` is `export const VERSION = "0.1.0";`. The test restates the
  constant. The assertion worth making — that `src/version.ts` agrees with
  `package.json`'s `version`, which `renderJson` stamps into every report — is
  not made anywhere.

Repo conventions: Bun only, never npm or yarn. Conventional commits
(`feat:`, `fix:`, `chore:`, `docs:`), see `git log`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `bun install`       | exit 0              |
| Typecheck | `bun run typecheck` | exit 0, no output   |
| Tests     | `bun test`          | 104 pass, 0 fail    |

## Scope

**In scope**:
- `.github/workflows/ci.yml` (create)
- `tests/smoke.test.ts`
- `README.md` (the two stale spots named above)

**Out of scope**:
- Any `src/` change. This plan adds verification; plans 005–008 use it.
- Adding a linter or formatter. The repo has neither, and choosing one is a
  maintainer decision, not an executor's.
- Coverage thresholds. The audit's explicit verdict was that the suite's problem
  is shape, not size — a percentage gate would be satisfied by more of the same.

## Git workflow

- Branch: `advisor/004-verification-baseline`
- Conventional commits. Do NOT push or open a PR.

## Steps

### Step 1: Add the workflow

Create `.github/workflows/ci.yml`: trigger on `push` and `pull_request`, single
job on `ubuntu-latest`, using `oven-sh/setup-bun@v2`. Steps: checkout,
setup-bun, `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`.

Do not add a matrix — the package declares `engines.bun` only and does not run
on Node, so there is one runtime to test.

**Verify**: `python3 -c "import sys,yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"` → no output
(or any YAML parser available; the file must parse).

### Step 2: Make the smoke test assert something

Replace the body of `tests/smoke.test.ts` so it asserts that `VERSION` equals
the `version` field in `package.json`, read at test time. That is the invariant
that actually matters: `renderJson` stamps `VERSION` into every report, and
nothing currently stops the two drifting apart at release.

Keep the file — it is the only test at the suite root and the first one a
contributor opens.

**Verify**: `bun test tests/smoke.test.ts` → passes. Then temporarily change
`src/version.ts` to `"9.9.9"`, re-run, and confirm it **fails**; revert.

### Step 3: Fix the two stale README spots

- `README.md:289` — point the smoke command at `tests/fixtures/lock-drift`,
  which exists and produces findings.
- Add one line to the Development section noting that CI runs typecheck and
  tests on every push.

**Verify**: `bun run src/cli.ts check tests/fixtures/lock-drift` → exit 0 and
prints at least one finding. `grep -c next16-redundant-skill README.md` → 0.

### Step 4: Confirm the gate actually catches a failure

Temporarily break one test (change an expected value), run `bun test`, confirm
non-zero exit, then revert. This proves the command CI depends on fails loudly
rather than passing with a warning.

**Verify**: broken → `bun test` exits non-zero; reverted → 104 pass.

## Test plan

No new test files beyond the rewrite of `tests/smoke.test.ts`. The verification
here is the workflow itself plus Step 4's deliberate-failure check.

Model the version assertion on how other tests import from source — plain
`import` at the top of the file; read `package.json` with
`import pkg from "../package.json"` (Bun supports JSON imports) rather than
`readFileSync`, matching the repo's preference for static imports.

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and parses as YAML
- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 104+ pass, 0 fail
- [ ] `tests/smoke.test.ts` fails when `src/version.ts` is changed and passes when reverted
- [ ] `grep -c next16-redundant-skill README.md` → 0
- [ ] `bun run src/cli.ts check tests/fixtures/lock-drift` exits 0 and prints a finding
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `bun test` is already failing before you change anything — report the failure;
  do not fix it inside this plan.
- The excerpts in "Current state" do not match the live code.
- Setting up the workflow tempts you to add a linter, a formatter, or a coverage
  gate. Those are out of scope; report the temptation instead.

## Maintenance notes

- The workflow pins nothing but the action major version; if `setup-bun` changes
  its input names this breaks loudly in CI rather than silently.
- Once CI exists, plans 005–008 each become "green means green". Until then
  their done criteria rest on someone remembering to run two commands.
- Deliberately deferred: publishing (`npm publish` on tag) and a lint step. The
  package is not published yet and the repo has no lint config to run.
