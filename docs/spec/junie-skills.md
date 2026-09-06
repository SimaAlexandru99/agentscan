# Junie skills

**Source:** https://junie.jetbrains.com/docs/agent-skills.html
**Read:** 2026-09-07
**Depends on it:** `agent-skills.skill.*` on `.junie/skills`, except
`missing-description` and `name-does-not-match-directory` (not quoted)

## Locations

Quoted: `<projectRoot>/.junie/skills/<skill-name>/` and
`~/.junie/skills/`. Also `.agents/skills/` (already scanned as portable
Agent Skills with required `description`).

`SKILL.md` is required. A folder without it is not a skill.

## Frontmatter

Quoted table: `name` is required (unique identifier). `description` is
**optional** ("No" — a short summary Junie can use).

Do not emit `agent-skills.skill.missing-description` for
`sourceProvider === "junie"`. Do not emit
`agent-skills.skill.name-does-not-match-directory` — the page does not
require `name` to equal the folder.

Portable `.agents/skills` in the same project still requires description.

## Deliberately unread

- `--skill-location` / `skill-locations` in config.json
- Extension-provided skills
- Junie MCP (separate page; not this capture)

## Staleness risk: HIGH
