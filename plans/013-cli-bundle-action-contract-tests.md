# Plan 013: Add CLI, bundle, and Action contract tests

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Depends on: 011
- Category: tests
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- src/cli.ts src/commands/check.ts package.json action.yml tests`. Compare current CLI flags and package bin before proceeding; stop if they differ materially.

## Why this matters

The 201 tests call TypeScript functions directly. None invokes `src/cli.ts`, `dist/cli.js`, or the composite Action, so dispatch, parsing, bundled behavior, and Action output wiring can regress unnoticed.

## Current state

- CLI dispatch is `src/cli.ts:52-240`.
- The published bin is `dist/cli.js` from `package.json:42`.
- Existing integration tests call `runCheck` directly.

## Commands

`bun run build` → produces `dist/cli.js`; `bun test` → all tests pass; `bun run typecheck` → exit 0.

## Scope

In scope: a subprocess test under `tests/integration/`, and a deterministic Action contract test for argument/output handling.

Out of scope: a live GitHub runner, clipboard behavior beyond existing tests, and CLI behavior changes.

## Steps

1. Build before subprocess tests. Invoke Node with `dist/cli.js --version`, `--help`, an invalid option, clean-fixture `check --json`, and a fixture with `--fail-on error`; assert stdout shape and exit codes.
2. Test the Action shell contract from Plan 011: valid arguments are forwarded, invalid values stop before execution, and multiline report output is preserved.
3. Use temporary synthetic fixtures only; do not mutate real projects or require network.

**Verify after Step 1:** the subprocess test passes under Node and reports the expected exit codes.

**Verify after Step 2:** the Action contract test parses `action.yml` and confirms the env/quoted-variable boundary and output delimiter contract.

**Verify after Step 3:** `bun test` passes with no network calls.

## Test plan

Create `tests/integration/cli-contract.test.ts` using `spawnSync`/`spawn` from Node stdlib and the existing fixtures. Create a small YAML/text contract test for `action.yml` using the already-installed `yaml` package; do not add a test framework or invoke GitHub-hosted services.

## Done criteria

- [ ] Node executes the built artifact in tests.
- [ ] CLI success, failure, and invalid-argument exit codes are asserted.
- [ ] Action argument/output contract is tested without a live runner.
- [ ] Existing suite, typecheck, and build pass.

## STOP conditions

Stop if this requires a new test framework or network access.

## Maintenance notes

Any change to CLI flags, `action.yml`, or package `bin/files` must update these contract tests.
