# Cline skills

**Source:** https://docs.cline.bot/customization/skills
**Also:** https://docs.cline.bot/getting-started/config
**Read:** 2026-09-07
**Depends on it:** `agent-skills.skill.*` on `.cline/skills`

## Locations

Quoted: place skill directories in `.cline/skills/` (workspace) or
`~/.cline/skills/` (global).

Required fields quoted: `name` must exactly match the directory name;
`description` max 1024 characters.

## Deliberately unread

- `.cline/hooks/` — the hooks page did not quote an event identifier table
  on 2026-09-07 (stub / incomplete fetch). Do not invent `cline.hook.*`.
- `.cline/agents/` — no quoted filename pattern or required fields.
- `~/.cline/data/settings/cline_mcp_settings.json` — user MCP settings, not
  a project path. Not added to `mcpPaths`.

## Staleness risk: HIGH
