# Cursor skills

**Source:** https://cursor.com/docs/skills
**Read:** 2026-11-14
**Depends on it:** `agent-skills.skill.*`, `skill.missing-skill-md`

Cursor project skills live under `.cursor/skills` and `.agents/skills`. Both
use the Agent Skills contract (`name` and `description` required). Discovery
walks recursively for directories that contain `SKILL.md`; a grouping folder
such as `.cursor/skills/frontend/` is not itself a skill.

Re-read 2026-11-14. Quoted: "Skills are automatically loaded from these
locations:" then `.agents/skills/` (Project-level), `.cursor/skills/`
(Project-level), `~/.agents/skills/` (User-level, local machine), and
`~/.cursor/skills/` (User-level, local machine). User-level skills are not
copied to Cloud Agents unless synced. Quoted: "For compatibility, Cursor also
loads skills from Claude and Codex directories: `.claude/skills/`,
`.codex/skills/`, `~/.claude/skills/`, and `~/.codex/skills/`." The page does
not say those directories use the Agent Skills contract. Quoted frontmatter:
"Must match the parent folder name." (`name`).

Nested package roots (`packages/app/.cursor/skills`) are in scope. Product
identity stays `cursor`; the file schema is `agent-skills`.

Claude-native `.claude/skills` keep the looser Claude contract (name optional,
no name-vs-directory check). Cursor loading `.claude/skills` for compatibility
is new on 2026-11-14; no decision has been made on whether Cursor should apply
the Claude contract to those files.

## Staleness risk: HIGH
