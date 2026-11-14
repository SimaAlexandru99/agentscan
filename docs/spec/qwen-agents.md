# Qwen Code subagents

**Source:** https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/
**Also:** https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sub-agents.md
**Read:** 2026-11-14
**Depends on it:** (new) — proposed `qwen.agent.*` rules

## Location

Quoted:

> Subagents are stored as Markdown files in multiple locations:
>
> Project-level: `.qwen/agents/` (highest precedence)
>
> User-level: `~/.qwen/agents/` (fallback)

Extension agents live in an extension's `agents/` directory and are listed in
`qwen-extension.json` under an `agents` field. agentscan does not open those.

## Required frontmatter

Quoted, "File Format": "Subagents are configured using Markdown files with
YAML frontmatter."

Quoted basic structure:

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit, fast, modelId, or authType:modelId
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo, bubble
tools:         # Optional: allowlist of tools
  - tool1
  - tool2
disallowedTools: # Optional: blocklist of tools
  - tool3
---

System prompt content goes here.
```

The docs label only `model`, `approvalMode`, `tools` and `disallowedTools` as
optional in that block. `name` and `description` appear without an "Optional"
comment. No table states them as required. See Unverified.

The body after the closing `---` is the system prompt.

## Claude Code compatibility fields

Quoted: "Qwen Code accepts the Claude Code 2.1.168 frontmatter fields below so
you can drop a CC agent file into `.qwen/agents/` and have the supported fields
parse identically. Optional fields with invalid values are silently dropped at
parse time rather than rejected."

Accepted: `permissionMode` (maps to `approvalMode`; the explicit `approvalMode`
wins), `maxTurns`, `color` (`red`, `blue`, `green`, `yellow`, `purple`,
`orange`, `pink`, `cyan`, or `auto`), `mcpServers` (per-agent MCP overrides, same
entry shape as settings), and `hooks` (CC event names, same group shape as
settings).

Not supported yet, per the docs: `effort`, `skills`, `initialPrompt`, `memory`,
`isolation`.

Quoted on invalid optional values: they are "silently dropped at parse time rather
than rejected". A lint must not report them as errors.

## Gemini comparison

No Gemini subagent capture exists in `docs/spec/`. Nothing is reused.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `<project>/.qwen/agents/*.md` | planned: yes |
| User | `~/.qwen/agents/*.md` | planned: yes, under `--global` |
| Extension | `<ext>/agents/*.md` | no |
| Not documented | `.agents/agents/`, `.claude/agents/` | no. Not in the Qwen docs |

## Unverified

- Whether `name` and `description` are required, and whether `name` must be
  unique or match the filename. The docs show both fields and call neither
  required.
- Whether `approvalMode` `bubble` and `auto` are valid in every release. The
  docs list `default`, `plan`, `auto-edit`, `yolo`, `bubble` for `approvalMode`,
  and `auto` only for `permissionMode` compatibility.
- Whether a `.md` file in `.qwen/agents/` without frontmatter is an error or is
  skipped. Not stated.
- Fork profiles at `.qwen/fork-profiles/<name>.md` are a separate surface with
  a different schema (`tools` required, `promptHint` optional). They are not
  subagents and are not captured here.

## Staleness risk: HIGH

The compatibility table is large and changes with Claude Code's own frontmatter.
Re-read before adding any field-level rule.
