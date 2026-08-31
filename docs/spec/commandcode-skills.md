# Command Code skills

**Source:** https://commandcode.ai/docs/skills
**Read:** 2026-08-31
**Depends on it:** `agent-skills.skill.*` on `.commandcode/skills` and extra
locations; discovery of `.agents/skills` compatibility paths

Quoted: "Command Code fully implements the Agent Skills open standard."
Required `name` / `description` therefore follow [agent-skills.md](agent-skills.md),
not Claude's optional-name native skills page.

A skill is a directory that contains `SKILL.md`. Discovery is recursive:
grouping folders are not skills; `scripts/` / `references/` / `assets/` are
never scanned for more skills.

## Locations and precedence

1. `.commandcode/skills/` (project)
2. `.agents/skills/` (project)
3. `~/.commandcode/skills/` (user, `--global`)
4. `~/.agents/skills/` (user, `--global`)
5. Extra locations from the highest-precedence settings `skills` array
6. Bundled skills that ship with Command Code — **not scanned** (not in the
   project tree)

`--skill` / `--no-skills` are Command Code launch flags, not agentscan flags.

## Extra locations

`skills` in settings.json (user, project, or `settings.local.json`):

- `~/` expands to home
- relative paths resolve against the project root
- "Settings layers overwrite the array whole — the highest layer that defines
  `skills` wins."

## `.agents` compatibility

Command Code also loads `.agents/skills/` and `~/.agents/skills/`. On name
conflicts, `.commandcode/` wins. agentscan inventories both; portable Agent
Skills checks apply to both. `sourceProvider` is `commandcode` only for
`.commandcode` paths.

## Staleness risk: HIGH
