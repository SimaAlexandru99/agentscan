# Cursor skills

**Source:** https://cursor.com/docs/skills
**Read:** 2026-09-02
**Depends on it:** `agent-skills.skill.*`, `skill.missing-skill-md`

Cursor project skills live under `.cursor/skills` and `.agents/skills`. Both
use the Agent Skills contract (`name` and `description` required). Discovery
walks recursively for directories that contain `SKILL.md`; a grouping folder
such as `.cursor/skills/frontend/` is not itself a skill.

Nested package roots (`packages/app/.cursor/skills`) are in scope. Product
identity stays `cursor`; the file schema is `agent-skills`.

Claude-native `.claude/skills` keep the looser Claude contract (name optional,
no name-vs-directory check).

## Staleness risk: HIGH
