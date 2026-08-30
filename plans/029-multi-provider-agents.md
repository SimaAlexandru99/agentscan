# Plan 029: Discover agent definitions per provider schema

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/discover/agents.ts src/checks/agents.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/027-honesty-and-0-8-0.md, plans/028-instruction-hierarchy.md
- **Category**: direction
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

`discoverAgents` only reads `<root>/.claude/agents/**/*.md`. Claude also
discovers `.claude/agents` on the path from the working directory to the
repository root. VS Code uses `.github/agents/*.agent.md` (name may come from
filename). Codex uses `.codex/agents/*.toml`. Duplicate names must be scoped
per namespace.

## Spec captures (do first)

- https://code.claude.com/docs/en/sub-agents
- https://code.visualstudio.com/docs/copilot/customization/custom-chat-modes (or current agents page)
- Codex agents TOML page under developers.openai.com/codex
- Cursor / Grok / Junie official agent-definition pages only

STOP when a page is missing.

## Scope

**In scope**: `src/discover/agents.ts` (or split per provider), `AgentFact` fields (`sourceProvider`, `schemaProfile`, `namespace`, `nameSource: "frontmatter" | "filename"`), `src/checks/agents.ts` namespaced IDs, tests.

**Out of scope**: `agent.unknown-model` / `agent.unknown-tool`; comparing Claude `name` to filename (plan 003 prohibition).

## Steps

1. Capture specs.
2. Claude: walk ancestors from `facts.root` (or requested dir if still available) to git/workspace root; discover each `.claude/agents`. Tag `sourceProvider: "claude"`. Keep `claude.agent.*` checks.
3. VS Code: `.github/agents/*.agent.md` if the page confirms the suffix. If name is optional and derived from filename, do **not** emit `claude.agent.missing-name`; emit `vscode.agent.*` only for fields that page requires.
4. Codex: parse `.codex/agents/*.toml` with the same Node TOML parser as 025. Checks only for fields the page requires.
5. `claude.agent.duplicate-name` (and siblings) only within the same `namespace` + precedence layer.
6. Cursor / Grok / Junie: implement only with captures.
7. Tests: nested Claude agents dir is found; VS Code file without frontmatter `name` is not a Claude missing-name error; Codex TOML does not go through YAML frontmatter checks.

## Done criteria

- [ ] Root-only `.claude/agents` limitation is gone
- [ ] At least Claude + one other captured provider
- [ ] No Claude YAML checks on TOML agents
- [ ] Gates green

## STOP conditions

- Forcing YAML frontmatter on Codex TOML or Kiro JSON.
- Filename-equals-name check for Claude.

## Maintenance notes

030 may attach hooks from agent frontmatter on new files the same way 020 did for Claude.
