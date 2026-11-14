# Factory Droid custom droids (subagents)

**Source:** https://docs.factory.com/harness/subagents (same text at https://docs.factory.com/cli/configuration/custom-droids)
**Read:** 2026-11-14
**Depends on it:** (new)

Quoted:

> A custom droid is a reusable subagent defined in Markdown.

> Each droid file is Markdown with YAML frontmatter followed by the system prompt body.

> The CLI scans the top level of each `droids/` folder, validates every definition, and exposes valid droids as `subagent_type` targets for the Task tool.

> When a project droid and a personal droid share the same name, the project definition wins.

Frontmatter (table): `name` (Required; "Lowercase letters, digits, `-`, `_` (`^[a-z0-9-_]+$`). Drives the `subagent_type` value and filename."). `description` (Optional but recommended; over 500 characters raises a validation warning). `model` (default `inherit`). `reasoningEffort` (optional; `low`, `medium`, `high`). `tools` (omit to allow all tools, a category string, or an array of tool IDs). `mcpServers` (optional array of MCP server names).

> The body after the frontmatter is the system prompt and cannot be empty.

Tool policy rules enforced at load: `TodoWrite` and `Skill` always included; `ExitSpecMode` and `GenerateDroid` cannot be enabled by a custom droid (validation error); `tools: all` is rejected.

Tool categories: `read-only`, `edit` (`Create`, `Edit`, `ApplyPatch`), `execute` (`Execute`), `web` (`WebSearch`, `FetchUrl`), `mcp`. Tool IDs are case-sensitive.

Built-in droids (no file needed): `worker` and `explorer`.

Claude Code agents are not loaded directly. The page says they are converted only through the import flow in `/droids`, which "scans both `<repo>/.claude/agents/` (project scope) and `~/.claude/agents/` (personal scope)".

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| Project | `.factory/droids/<name>.md` (top level only) | yes |
| Personal | `~/.factory/droids/<name>.md` (top level only) | `--global` only |

## Unverified

- Whether the loader requires the filename stem to equal `name`. The page says the CLI "normalizes the filename to lowercase and hyphenated" when writing, and that `name` "Drives the `subagent_type` value and filename", but does not state the load-time check.
- Whether `name` is allowed to contain `_` in the filename. The regex permits it; no example uses it.
- Whether `.factory/droids/` files are validated against the `description` length as a warning only. Stated as a warning, so not an error.
- Whether `Read`, `LS` and other tool IDs in an array are validated against a full list. The page lists categories and says "Unknown IDs cause a validation error", but the complete ID list is not on the page.

## Staleness risk: HIGH
