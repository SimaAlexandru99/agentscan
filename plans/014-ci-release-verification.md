# Plan 014: Verify the published artifact in CI

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Depends on: 013
- Category: dx
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- .github/workflows/ci.yml .github/workflows/spec-drift.yml package.json`. Stop if CI already has artifact or scheduled spec verification not described here.

## Why this matters

CI typechecks, tests source, and runs a source dogfood scan, but does not build the artifact published by npm. A source-only green build can still ship a stale or broken `dist/cli.js`.

## Current state

- `.github/workflows/ci.yml:19-25` runs install, typecheck, tests, and source check.
- `package.json:42-43` builds `dist/cli.js` only through `build`/`prepublishOnly`.
- `scripts/spec-drift.ts:3-8` is deliberately release-time and networked.

## Scope

In scope: `.github/workflows/ci.yml` and a new `.github/workflows/spec-drift.yml` scheduled/release workflow.

Out of scope: changing the detector algorithm, making normal scans use the network, or publishing from CI.

## Steps

1. Add `bun run build` after tests.
2. Invoke the built Node artifact on the clean fixture (using Plan 013's subprocess contract) and assert exit 0.
3. Run `bun run spec:check` in a scheduled/release-only job, not the ordinary PR gate, unless network-dependent PR checks are explicitly accepted.

**Verify after Step 1:** run the workflow YAML through the repository's available YAML parser or `git diff --check`; confirm the build step follows tests.

**Verify after Step 2:** locally run `bun run build` and `node dist/cli.js check tests/fixtures/clean-repo --json`; expect exit 0 and valid JSON.

**Verify after Step 3:** `bun run spec:check` exits 0 locally; the scheduled workflow remains isolated from the normal PR job.

## Test plan

Reuse Plan 013's built-artifact subprocess test locally. CI verification is declarative, so review the workflow diff and run its commands locally rather than adding a runner-dependent test.

## Done criteria

- [ ] CI fails if build or bundled smoke test fails.
- [ ] Normal CI remains deterministic without network access.
- [ ] Spec drift runs on an explicit schedule/release path or is documented as release-only.

## STOP conditions

Stop if the CI platform cannot provide a stable network policy for the spec job; leave it release-only.

## Maintenance notes

The release checklist must run build, bundled smoke test, and spec drift before tagging.
