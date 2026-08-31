# Grok Build subagents

**Source:** https://docs.x.ai/build/features/subagents
**Read:** 2026-08-31
**Depends on it:** none — agents stay unread

Quoted:

> Add or override types under `.grok/agents/` or `~/.grok/agents/`.

The page names the directories and three built-in types (`general-purpose`,
`explore`, `plan`). It does not name a filename pattern (`.md` vs `.toml`)
or required frontmatter fields.

Personas are documented as `[subagents.personas]` or
`.grok/personas/*.toml` / `~/.grok/personas/*.toml`. Personas are out of
scope.

Until a published filename pattern and field list exist, do not invent
`AgentFact` parsing for `.grok/agents`. Do not apply `claude.agent.*`.
Coverage cell: unread.

## Staleness risk: HIGH
