# Antigravity skills

**Source:** https://antigravity.google/docs/skills
**Read:** 2026-11-12
**Depends on it:** discovery only. No new rule id. This page is not in
`SPEC_SURFACES`.

The page calls skills an open standard. A skill is a folder with `SKILL.md`.
The page's frontmatter table says `description` is required and `name` is
optional (it defaults to the folder). This scanner applies the Agent Skills
contract (`agent-skills.skill.*`), which also requires `name`. A global
Antigravity skill that omits `name` is `agent-skills.skill.missing-name`.
That is stricter than this page.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `<workspace>/.agents/skills/<skill>/` and the same directory in each parent up to the scan root | already, as the `agent-skills` provider. Not a second Antigravity fact |
| Global | `~/.gemini/config/skills/<skill>/` | `--global` only, `sourceProvider: antigravity`, schema `agent-skills` |

Unread in this pass: `~/.gemini/config/plugins/<plugin>/skills/`,
`~/.gemini/antigravity-cli/skills/`, `~/.gemini/skills/`, and the IDE legacy
directory `~/.gemini/antigravity/skills/`.
