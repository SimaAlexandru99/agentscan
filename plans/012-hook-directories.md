# Plan 012: Treat hook directories as missing scripts

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Depends on: none
- Category: bug
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- src/discover/index.ts tests/unit/hook-script.test.ts`. Stop if the hook path resolver changed since this plan.

## Why this matters

`existsSync()` returns true for directories. A hook command that resolves to an existing directory is therefore treated as healthy even though Claude cannot execute it as a script.

## Current state

- `src/discover/index.ts:637-638` resolves a hook path and sets `exists` from `existsSync(abs)`.
- `src/checks/index.ts:291-294` reports only when `scriptExists === false`.
- Hook parsing is intentionally conservative; do not broaden command parsing here.

## Commands

`bun run typecheck` → exit 0; `bun test` → all tests pass; `git diff --check` → no output.

## Scope

In scope: `src/discover/index.ts`, `tests/unit/hook-script.test.ts` or the smallest existing hook fixture.

Out of scope: executable-bit policy, shell parsing, symlink policy, or Action files.

## Steps

1. Replace the existence predicate with `statSync(abs).isFile()`, catching stat errors as false. Preserve display paths and variable expansion.
2. Add a regression where the resolved path is an existing directory; assert `hook.missing-script`. Keep regular-file and missing-file cases green.

**Verify after Step 1:** `bun run typecheck` exits 0.

**Verify after Step 2:** `bun test tests/unit/hook-script.test.ts` passes and includes the directory case.

## Test plan

Model the new case on the existing `hookScriptPath` tests and add an integration assertion through `runChecks` so the discovery boolean and emitted finding are both covered.

## Done criteria

- [ ] Existing directories produce `scriptExists: false`.
- [ ] Existing regular files remain healthy.
- [ ] Missing files remain findings.
- [ ] Baseline tests and typecheck pass.

## STOP conditions

Stop if deciding whether regular files must also be executable is required; that is a separate policy decision.

## Maintenance notes

Keep the file-type check limited to paths actually extracted as script paths.
