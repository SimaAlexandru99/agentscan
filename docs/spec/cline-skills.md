# Cline skills

**Source:** https://docs.cline.bot/customization/skills
**Also:** https://docs.cline.bot/getting-started/config
**Read:** 2026-11-14
**Depends on it:** `agent-skills.skill.*` on `.cline/skills`

## Locations

CHANGED-MEANING (read 2026-11-14): the page now lists three project sources,
not one. Quoted under "Where Skills Live" / "Project skills":
"`.cline/skills/` (recommended)", "`.clinerules/skills/`", "`.claude/skills/`".
Global: "`~/.cline/skills/` (macOS/Linux)". On a same-name conflict "the global
skill takes precedence". Previous capture (2026-09-07): only `.cline/skills/`
(workspace) and `~/.cline/skills/` (global). Rule-affected:
`agent-skills.skill.*` on `.clinerules/skills` and `.claude/skills` (now Cline
project sources) as well as `.cline/skills`.

Quoted (2026-09-07 and unchanged 2026-11-14): `~/.cline/skills/` (global).

Required fields quoted: `name` must exactly match the directory name;
`description` max 1024 characters.

## Deliberately unread

- `.cline/hooks/` — the hooks page did not quote an event identifier table
  on 2026-09-07 (stub / incomplete fetch). Do not invent `cline.hook.*`.
- `.cline/agents/` — no quoted filename pattern or required fields.
- `~/.cline/data/settings/cline_mcp_settings.json` — user MCP settings, not
  a project path. Not added to `mcpPaths`.

## Staleness risk: HIGH
