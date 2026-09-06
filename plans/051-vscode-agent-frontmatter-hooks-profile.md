# Plan 051: Parse VS Code `.agent.md` frontmatter hooks as vscode-native

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/discover/agents.ts src/discover/hooks.ts tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (wrong profile today can already false-positive)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-07

## Why this matters

VS Code documents agent-scoped hooks in custom-agent frontmatter. Discovery
already reads `.github/agents/*.agent.md` `hooks:` (`src/discover/agents.ts`
lines 176–183) and flattens them into `facts.hooks` (`src/discover/index.ts`
lines 345–349). But `hooksFromObject` is called **without** `sourceProvider`,
so it defaults to `"claude"` (`src/discover/hooks.ts` line 642). The later
`.map((h) => ({ ...h, sourceProvider: "vscode" }))` does **not** change
`schemaProfile`, which was already set to `"claude"`.

A documented VS Code example is a **flat** command-handler array:

```
hooks:
  PostToolUse:
    - type: command
      command: "./scripts/format-changed-files.sh"
```

Claude's `nestedOnly` path treats each object as a matcher group without a
nested `hooks` array → `claude.hook.invalid-group` on a working VS Code
agent. That is a false positive on a surface the tool already opens.

## Current state

```176:183:src/discover/agents.ts
    if (fm.hooks !== undefined) {
      const hooks = hooksFromObject(fm.hooks, filePath, "agent", {
        project: root,
        own: dirname(filePath),
      }, errors);
      if (hooks.length > 0) {
        fact.frontmatterHooks = hooks.map((h) => ({ ...h, sourceProvider: "vscode" }));
      }
    }
```

`hooksFromObject` signature (`src/discover/hooks.ts` 637–644):

```
sourceProvider: Provider = "claude",
schemaProfile?: HookSchemaProfile,
```

`discoverVscodeAgents` only walks `.github/agents`. The 2026-09-06 VS Code
hooks page also names "Custom agent" / `.agent.md` frontmatter. If the page
quotes additional directories, add them; if not, `.github/agents` is enough.

Pages: https://code.visualstudio.com/docs/agent-customization/hooks
and https://code.visualstudio.com/docs/agents/reference/hooks-reference
(eight events; `type: "command"` required).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Spec | `bun run spec:check` | exit 0 |

## Scope

**In scope**:
- `src/discover/agents.ts` — pass `"vscode"` and `"vscode-native"` into
  `hooksFromObject`; drop the post-hoc map or keep it redundant
- `docs/spec/vscode-hooks.md` / `docs/spec/vscode-agents.md` — quote
  agent-scoped hooks
- Tests
- README VS Code coverage: agent frontmatter hooks are scanned (schema
  vscode-native)

**Out of scope**: VS Code plugin `hooks.json` (052). `chat.hookFilesLocations`
custom paths (unpublished resolution). Changing the eight-event list.

## Git workflow

- Branch: `advisor/051-vscode-agent-frontmatter-hooks-profile`
- Commit: `fix: lint VS Code agent frontmatter hooks as vscode-native`

## Steps

### Step 1: Fix the call

Change the `hooksFromObject` invocation to:

```
hooksFromObject(
  fm.hooks,
  filePath,
  "agent",
  { project: root, own: dirname(filePath) },
  errors,
  "vscode",
  process.platform,
  "vscode-native",
)
```

**Verify**: typecheck. Existing Claude agent frontmatter hooks still pass
`sourceProvider: "claude"` in `discoverClaudeAgentsDir` (do not change that
call).

### Step 2: Tests

In `tests/unit/` (new or existing vscode-hooks tests):

1. `.github/agents/fmt.agent.md` with the official flat `PostToolUse` /
   `type: command` / existing script → **zero** `claude.hook.*` and zero
   `vscode.hook.invalid-group`
2. Same file, missing script → `vscode.hook.missing-script`
3. Same file, event `NotAnEvent` → `vscode.hook.unknown-event` (not Claude)
4. Claude `.claude/agents/x.md` frontmatter hooks still Claude-profiled

**Verify**: `bun test` those cases.

### Step 3: Capture + README

Quote agent-scoped hooks in `docs/spec/vscode-hooks.md` or `vscode-agents.md`.
README: project discovery mentions `.github/agents` frontmatter hooks.

**Verify**: `bun test && bun run typecheck && bun run spec:check`

## Test plan

As Step 2. Model on `tests/unit/gemini-cursor-hooks.test.ts` "Claude name on
the other provider is unknown *here*".

## Done criteria

- [x] Gates pass
- [x] Official-shaped VS Code agent hooks are not `claude.hook.invalid-group`
- [x] `plans/README.md` updated

## STOP conditions

- Live page says agent frontmatter uses Claude nested `{ matcher, hooks }` —
  then vscode-native flat parse would be wrong; recapture and STOP.
- You need to scan `.agent.md` files outside `.github/agents` without a
  quoted directory.

## Maintenance notes

Reviewer: `schemaProfile` on the fact, not only `sourceProvider`, is what
the checks read (`inferHookSchemaProfile` prefers explicit profile).
