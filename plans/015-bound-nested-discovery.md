# Plan 015: Bound nested skill discovery

## Status

- Priority: P2
- Effort: M
- Risk: MED
- Depends on: 013
- Category: perf
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- src/discover/index.ts tests/unit/dedupe-skills.test.ts`. Stop if nested traversal or worktree pruning has changed.

## Why this matters

Nested `.claude/skills` discovery recursively scans from the repository root and synchronously opens every directory not in a small skip set. Large monorepos and vendor trees pay for filesystem traversal unrelated to agent configuration.

## Current state

- `src/discover/index.ts:382-420` walks every descendant looking for a `skills` child under `.claude`.
- `src/discover/index.ts:925-926` runs this walk after configured roots are already scanned.
- Nested package `.claude/skills` is required; `.claude/worktrees`, `.git`, `node_modules`, build outputs, and coverage are exclusions.

## Scope

In scope: nested traversal and tests/fixtures proving equivalent discovery with bounded traversal.

Out of scope: removing nested discovery, changing configured `skillPaths`, or adding a persistent cache.

## Steps

1. Add characterization coverage for root, nested package, excluded worktree, and irrelevant large-directory cases.
2. Replace the open-ended walk with bounded traversal that prunes known irrelevant directories and only descends far enough to find `.claude` containers; preserve symlink behavior and configured-root de-duplication.
3. Measure a synthetic irrelevant tree and assert the same skill set plus a deterministic traversal bound. Prefer an injected/internal directory-read counter over elapsed time so the test is not hardware-dependent.

**Verify after Step 1:** characterization tests pass on the pre-change traversal.

**Verify after Step 2:** `bun run typecheck` and the focused discovery tests pass.

**Verify after Step 3:** the counter remains below the fixture's bound and the discovered skill IDs are unchanged.

## Test plan

Extend `tests/unit/dedupe-skills.test.ts` with root, nested, worktree, and irrelevant-tree fixtures. If counting requires a helper seam, keep it internal to discovery and do not expose a new CLI option.

## Done criteria

- [ ] Root and nested fixtures discover the same skills as before.
- [ ] Worktrees and known build/vendor directories remain excluded.
- [ ] Irrelevant traversal is bounded by a deterministic test.
- [ ] Baseline commands pass.

## STOP conditions

Stop if preserving nested discovery requires following symlinks or scanning arbitrary hidden directories.

## Maintenance notes

Every new supported nested root needs one fixture and one explicit traversal rule; do not silently widen the whole-tree walker.
