# Kiro agents

**Source:** https://kiro.dev/docs/agents
**Read:** 2026-11-12
**Depends on it:** discovery only. No new rule id. This page is not in
`SPEC_SURFACES`.

The page was updated November 3, 2026. JSON and Markdown support the same
fields. The example (`name`, `description`, `tools`, and the rest) is not a
required-field table. This scanner does not check those fields and does not
emit `claude.agent.*` for these files.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `<dir>/.kiro/agents/**/*.json` and `**/*.md` | yes, on the ancestor walk. A directory below the start directory is not opened |
| Global | `~/.kiro/agents/**/*.json` and `**/*.md` | `--global` only |

Dotfiles and other extensions are skipped. `.kiro/hooks/` stays the hook
reader. Invalid JSON is the existing `config.unreadable` error. A JSON root
that is not an object is one unexpected-shape error (`Kiro agent root is not
an object`). The file is still inventoried.

## Name and shadowing

The name is the path relative to the agents directory, without the extension.
`team/planner.md` is `team/planner`. The JSON or frontmatter `name` is not
compared to that path.

The page says a workspace agent wins over a global agent with the same name.
It does not say which workspace layer wins when two ancestors share a name.
The nearer directory (the start directory, then its parents) stays, and the
farther file gets `effective: false`. A `.json` and a `.md` with the same
stem in one directory are both kept. Markdown may have no YAML frontmatter.
`hasFrontmatter` is true only when a frontmatter block is present.
