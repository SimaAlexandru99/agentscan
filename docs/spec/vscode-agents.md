# VS Code custom agents

**Source:** https://code.visualstudio.com/docs/agent-customization/custom-agents
**Read:** 2026-08-30
**Depends on it:** discovery of `.github/agents/*.agent.md` (and `.md` in that folder)

## Location

Quoted:

> Workspace: `.github/agents` folder

> Custom agent files are Markdown files and use the `.agent.md` extension

> VS Code detects any `.md` files in the `.github/agents` folder of your
> workspace as custom agents.

## Frontmatter

The header is **optional**. Quoted field table:

| Field | Required? |
|-------|-----------|
| `name` | No — “If not specified, the file name is used.” |
| `description` | No — “A brief description…” |

Do **not** emit `claude.agent.missing-name` or `claude.agent.missing-frontmatter`
as errors for these files. Identity may come from the filename.

## Staleness risk: HIGH
