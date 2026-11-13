# Claude Code subagent discovery

**Source:** https://code.claude.com/docs/en/sub-agents
**Read:** 2026-11-13
**Depends on it:** walk-up `.claude/agents` discovery, `--global` `~/.claude/agents`, `claude.agent.duplicate-name` scope

Quoted (read 2026-08-30):

> Project subagents are discovered by walking up from the current working
> directory, so every `.claude/agents/` between there and the repository root
> is scanned. As of v2.1.178, when more than one of these nested directories
> defines the same `name`, Claude Code uses the definition closest to the
> working directory.

> Keep `name` values unique across the whole tree: if two files under the same
> `.claude/agents/` directory, including its subfolders, declare the same name,
> Claude Code loads only one of them

Duplicate-name errors are therefore scoped to one `.claude/agents` directory
(including its subfolders), not across walk-up layers.

Frontmatter `name` is still not compared to the filename (plan 003).

## Name rules

Quoted (read 2026-11-13):

> `name` | Yes | Unique identifier of at most 256 characters, such as
> `code-reviewer` or `reviewer-v2`. [...] The filename doesn't have to match.
> Names can't contain `:`, which is reserved for plugin-scoped identifiers
> such as `my-plugin:reviewer`

> A `name` that starts with `-`, contains `:`, or is longer than 256
> characters: Claude Code skips the file and writes an error to the debug log.

`claude.agent.invalid-name` is an error for exactly those cases plus an empty
name, and silent otherwise. Details in [agents.md](agents.md).

## User subagents (`--global`)

Quoted (read 2026-09-03):

> User subagents (`~/.claude/agents/`) are personal subagents available in
> all your projects.

> Claude Code scans `.claude/agents/` and `~/.claude/agents/` recursively,
> so you can organize definitions into subfolders

Opened only with `--global` / `includeGlobal`, under `CLAUDE_CONFIG_DIR`
when set. In-tree plugin `agents/` are also scanned; plugin frontmatter
`hooks` / `mcpServers` / `permissionMode` are ignored — the plugins page
says Claude skips those fields on plugin subagents.

## Staleness risk: MEDIUM
