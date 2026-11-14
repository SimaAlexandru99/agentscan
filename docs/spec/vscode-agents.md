# VS Code custom agents

**Source:** https://code.visualstudio.com/docs/agent-customization/custom-agents
**Read:** 2026-11-14
**Re-read:** 2026-09-07 (frontmatter `hooks` parsed as vscode-native)
**Reference (field and location tables, moved there 2026-11-14):** https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference
**Depends on it:** discovery of `.github/agents/*.agent.md` (and `.md` in that folder)

## Location

Quoted (reference page, 2026-11-14 table row):

> Workspace | `.github/agents` folder | `.agent.md` or `.md` files

Quoted (how-to page, 2026-11-14): "save it as `.github/agents/reviewer.agent.md`,
creating the folders if needed."

The 2026-08-30 sentences ("Custom agent files are Markdown files and use the
`.agent.md` extension"; "VS Code detects any `.md` files ...") are no longer on
either page. The same folder now accepts `.md` files as well (reworded).

## Frontmatter

The header is **optional**. Quoted field table:

| Field | Required? |
|-------|-----------|
| `name` | No — “If not specified, the file name is used.” |
| `description` | CHANGED-MEANING (2026-11-14): “What the agent does and when to use it. Required by the Copilot schema.” (reference page, `description` row; old: “No — A brief description…”) |

Do **not** emit `claude.agent.missing-name` or `claude.agent.missing-frontmatter`
as errors for these files. Identity may come from the filename. `name` still
“Defaults to the file name.” The `description` change affects any
missing-description check on these files (`src/checks/agents.ts`
`claude.agent.missing-description`); the owner decides whether to change it.

Frontmatter `hooks` (quoted on the VS Code hooks page as "Custom agent") are
parsed with `schemaProfile: "vscode-native"` at `hooksFromObject` time — not
Claude nested groups. A documented flat `type: command` array must not become
`claude.hook.invalid-group`. Reference page (2026-11-14) now says: “`hooks` |
Object | Hook event map scoped to this agent”, and “`hooks` : event maps with
action arrays.” The flat-array claim cites the VS Code hooks page, which this
refresh did not fetch.

## Staleness risk: HIGH
