# Plan 016: Reconcile runtime and version documentation

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: 014
- Category: docs
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- README.md action.yml package.json src/version.ts`. Stop if the supported runtime or current version changed.

## Why this matters

The package advertises Node and Bun support, while README known limits still says “Bun only”. The Action says it does not run on Node although the published bundle targets Node. Badges and the JSON example are stale (`197` tests and `0.1.0` versus current `201` and `0.4.0`).

## Current state

- `package.json:45-47` declares Node and Bun engines.
- `README.md:95-97` documents both, but `README.md:466` contradicts it.
- `action.yml:33-35` says the Action does not run on Node.
- `README.md:8-9` and `README.md:212` contain stale metadata.

## Scope

In scope: `README.md`, `action.yml` wording/comments, and release metadata examples.

Out of scope: changing runtime support, package engines, CLI implementation, or Action execution runtime.

## Steps

1. State the verified distinction: source development/Action uses Bun; published `dist/cli.js` runs on Node 20.11+ and Bun.
2. Update known-limits and Action text to match.
3. Update badges/examples from the verified release baseline and document a release checklist to prevent manual drift.

**Verify after Step 1:** `rg -n 'Bun only|will not run on Node|Node 20\.11|Bun' README.md action.yml package.json` shows only consistent statements.

**Verify after Step 2:** read the quick-start, known-limits, Action input, and engine sections together; they must describe the same runtime split.

**Verify after Step 3:** `bun run typecheck` and `bun run spec:check` pass; manually confirm the sample version matches `src/version.ts`.

## Test plan

This is documentation-only. Use repository searches for stale version/runtime claims and the existing typecheck/spec checks; do not add a snapshot that will merely freeze future release numbers.

## Done criteria

- [ ] Runtime statements agree across README, package, and Action.
- [ ] Version and test-count examples match the documented release.
- [ ] Typecheck and spec checks remain clean.

## STOP conditions

Stop if intended runtime support changes; that requires a release decision.

## Maintenance notes

Refresh badges/examples as part of release preparation, not ad hoc.
