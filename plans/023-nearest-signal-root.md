# Plan 023: Resolve the project root from the nearest provider signal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/discover/shared.ts tests/unit/resolve-root.test.ts`

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: MED
- **Depends on**: none (can run parallel with 021/022)
- **Category**: bug
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

`resolveRoot` walks up until `package.json` or one of seven signals
(`.claude`, `.agents`, `.mcp.json`, `mcp.json`, `AGENTS.md`, `CLAUDE.md`,
`skills-lock.json`). A subdirectory with only `.cursor`, `.vscode`, or
`.github` keeps walking and can scan the wrong parent. Blind “Git root first”
would break the existing test that a child `.claude` wins over a parent
`package.json`.

## Current state

```ts
// src/discover/shared.ts:63-94
const AGENT_CONFIG_SIGNALS = [
  ".claude", ".agents", ".mcp.json", "mcp.json",
  "AGENTS.md", "CLAUDE.md", "skills-lock.json",
] as const;

export function resolveRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "package.json")) || hasAgentConfigSignal(dir)) {
      return dir;
    }
    // walk up or throw
  }
}
```

Tests in `tests/unit/resolve-root.test.ts`: package.json; `.claude` without
package.json; child `.claude` over parent package.json; throw when empty.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test tests/unit/resolve-root.test.ts` | all pass including new cases |
| Full | `bun test` | all pass |

## Scope

**In scope**: `src/discover/shared.ts`, `tests/unit/resolve-root.test.ts`, export surface if `hasAgentConfigSignal` semantics change.

**Out of scope**: discovery of skills/MCP inside those new directories (024/025); Git worktree edge cases beyond “directory named `.git` exists”.

## Steps

### Step 1: Expand signals

Add: `.cursor`, `.vscode`, `.github`, `.codex`, `.grok`, `.gemini`, `.kiro`,
`.windsurf`, `.cline`, `.roo`, `.kilo`, `.opencode`, `.continue`, `.junie`.

### Step 2: Change the walk

Walk from `startDir` to filesystem root once, recording:
- nearest provider-signal directory
- nearest workspace/package directory (`package.json`, `pnpm-workspace.yaml`, `lerna.json`, `go.work`, `Cargo.toml`, `pyproject.toml`)
- nearest `.git` (file or directory)

Pick: nearest signal, else nearest workspace/package, else nearest git, else throw.

This preserves “child `.claude` over parent `package.json`” because the child
signal is nearer.

### Step 3: Tests

Keep the four existing tests. Add:
- start in a dir that has only `.cursor` → that dir
- same for `.vscode` and `.github`
- child `.cursor` wins over parent `package.json`
- subtree with no signal and no package.json, ancestor has `.git` → git root
- still throws on a completely empty temp dir (no git)

**Verify**: `bun test tests/unit/resolve-root.test.ts`

## Done criteria

- [ ] New signals are recognized
- [ ] Existing four tests still pass
- [ ] Git is a fallback, not a override of a nearer signal
- [ ] `bun test`, `bun run typecheck` exit 0

## STOP conditions

- Implementing “git first” to match a misreading of the audit — the locked decision is nearest-signal.
- `hasAgentConfigSignal` is used elsewhere in a way that treating `.git` as a signal would change (`.git` is **not** a provider signal).

## Maintenance notes

025 adds MCP paths under `.vscode` / `.cursor` / `.codex`; those directories
must already stop `resolveRoot`. Do not add `skills/` as a signal (too generic).
