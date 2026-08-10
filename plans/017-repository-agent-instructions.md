# Plan 017: Add repository-local agent instructions

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: dx
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- AGENTS.md README.md plans/README.md docs/spec`. Stop if repository-local instructions already exist or global policy has changed.

## Why this matters

This repository audits agent configuration but has no root `AGENTS.md` or `CLAUDE.md`. Executor agents must reconstruct Bun commands, no-write scan guarantees, plan workflow, and spec-drift rules from scattered documents.

## Scope

In scope: new root `AGENTS.md` only, linking README, `plans/README.md`, and `docs/spec/`.

Out of scope: duplicating global policy, changing code conventions, or inventing new repository rules.

## Steps

1. Add a short canonical file stating Bun commands (`bun test`, `bun run typecheck`, `bun run build`, `bun run spec:check`), strict TypeScript, read-only scanner guarantees, no network during normal scans, and plan status rules.
2. Link detailed behavior to README and spec evidence to `docs/spec/` instead of copying it.
3. Include the expected verification baseline.

**Verify after Step 1:** `wc -l AGENTS.md` is below 100 and every command named exists in `package.json`.

**Verify after Step 2:** links point to existing files and no long policy block is duplicated.

**Verify after Step 3:** `bun test` and `bun run typecheck` pass.

## Test plan

Use shell checks for file existence, line count, and command names; this documentation file does not need a runtime test.

## Done criteria

- [ ] Root `AGENTS.md` exists and is under 100 lines.
- [ ] Commands match `package.json` and pass locally.
- [ ] No duplicated global policy or secrets are added.

## STOP conditions

Stop if repository conventions conflict with global instructions; record the conflict instead of choosing a new policy.

## Maintenance notes

Update this file when package scripts, release flow, or scan guarantees change.
