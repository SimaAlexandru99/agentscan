# Plan 018: Split discovery and checks by boundary

## Status

- Priority: P3
- Effort: L
- Risk: HIGH
- Depends on: 013, 015
- Category: tech-debt
- Planned at: commit `feff905`, 2026-08-10

## Drift check

Run first: `git diff --stat feff905..HEAD -- src/discover src/discover/index.ts src/checks src/checks/index.ts tests`. Stop if earlier plans have already moved these boundaries.

## Why this matters

`src/discover/index.ts` is 966 lines and owns root resolution, parsing, traversal, MCP, hooks, agents, policy, and locks. `src/checks/index.ts` is 794 lines and owns all checks plus the public registry. Both are difficult to review and create large regression/merge surfaces.

## Current state

- Discovery orchestration and public helper exports are in `src/discover/index.ts`.
- Structural checks and `STRUCTURAL_CHECKS` are in `src/checks/index.ts`; budgets are already separate.
- Tests import `skillReferences`, `hookScriptPath`, `runChecks`, and `STRUCTURAL_CHECKS`; preserve these APIs or update all callers together.

## Scope

In scope: cohesive extraction into `src/discover/` and `src/checks/` modules, imports, and characterization tests preserving output/order.

Out of scope: new findings, severity changes, parser behavior changes, runtime policy changes, or independent performance redesign.

## Steps

1. Inventory exports and add characterization assertions for finding IDs/order, facts counts, and helper behavior. Keep this baseline green before moving code.
2. Extract discovery boundaries for skills/parsing, hooks, agents, MCP, policy/lock, leaving `index.ts` as orchestration. Keep shared types in `src/facts/types.ts` and avoid cycles.
3. Extract check boundaries for skills, hooks, agents, MCP, and config/lock checks, leaving registry/orchestration in `checks/index.ts`. Preserve registry order and `runChecks` output.
4. Run the full verification matrix and inspect the diff for out-of-scope behavior changes.

**Verify after Step 1:** characterization tests pass before extraction.

**Verify after Step 2:** `bun run typecheck` and discovery tests pass; exported helper tests remain green.

**Verify after Step 3:** `bun test tests/unit/checks.test.ts` passes and `STRUCTURAL_CHECKS` remains synchronized.

**Verify after Step 4:** `bun test`, `bun run typecheck`, `bun run build`, and `bun run spec:check` all pass.

## Test plan

Follow existing unit-test patterns in `tests/unit/checks.test.ts`, `tests/unit/skill-references.test.ts`, and `tests/unit/hook-script.test.ts`. Assert facts/findings, IDs, ordering, and public helper behavior rather than snapshots of implementation file layout.

## Done criteria

- [ ] Discovery and check implementations are no longer duplicated in the orchestration files; `index.ts` files only coordinate and export stable APIs.
- [ ] Public helpers and finding order remain stable.
- [ ] `bun test`, `bun run typecheck`, `bun run build`, and `bun run spec:check` pass.
- [ ] No new finding IDs or severity changes are introduced.

## STOP conditions

Stop if extraction requires changing a public export, finding ID, ordering guarantee, or runtime behavior.

## Maintenance notes

New runtime surfaces belong in their own discovery/check module and register through existing orchestration.
