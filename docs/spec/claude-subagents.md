# Claude Code subagent discovery

**Source:** https://code.claude.com/docs/en/sub-agents
**Read:** 2026-08-30
**Depends on it:** walk-up `.claude/agents` discovery, `claude.agent.duplicate-name` scope

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

## Staleness risk: MEDIUM
