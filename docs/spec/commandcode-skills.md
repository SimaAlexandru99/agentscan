# Command Code skills

**Source:** https://commandcode.ai/docs/skills
**Read:** 2026-09-02
**Depends on it:** `agent-skills.skill.*` on `.commandcode/skills` and extra
locations; discovery of `.agents/skills` compatibility paths

Quoted: "Command Code fully implements the Agent Skills open standard."
Required `name` / `description` therefore follow [agent-skills.md](agent-skills.md),
not Claude's optional-name native skills page.

A skill is a directory that contains `SKILL.md`. Discovery is recursive:
grouping folders are not skills; `scripts/` / `references/` / `assets/` are
never scanned for more skills.

## Locations and precedence

Command Code **project** paths below are only at the Command Code project
root (git root, or cwd outside a git repo). Nested package
`.commandcode/skills` is not project config.

`.agents/skills` is the walk-up compatibility source: from the working
directory, at most 10 parent hops, **stopping before home** so
`~/.agents/skills` is never treated as a project source.

1. `<project>/.commandcode/skills/` (project root only)
2. `.agents/skills/` (walk-up, max 10 hops from cwd, not home)
3. `~/.commandcode/skills/` (user, `--global`)
4. `~/.agents/skills/` (user, `--global`)
5. Extra locations from the highest-precedence settings `skills` array
   (relative paths resolve against the Command Code project root)
6. Bundled skills that ship with Command Code — **not scanned** (not in the
   project tree)

On name conflicts, a higher row shadows a lower row. agentscan inventories
every readable source and sets `commandcodeEffective`. Spec/runtime skill
checks do not claim a shadowed Command Code definition is currently loaded.
Portable Agent Skills checks still apply to shadowed `.agents/skills`
(Cursor and other consumers). Security checks may inspect all readable
config.

`--skill` / `--no-skills` are Command Code launch flags, not agentscan flags.

## Extra locations

`skills` in settings.json (user, project, or `settings.local.json`):

- `~/` expands to home
- relative paths resolve against the Command Code project root (git root, or
  cwd outside a git repo)
- "Settings layers overwrite the array whole — the highest layer that defines
  `skills` wins."

## `.agents` compatibility

Command Code also loads `.agents/skills/` (walk-up, max 10 hops from cwd,
stopping before home) and `~/.agents/skills/` under `--global`. On name
conflicts, `.commandcode/` wins. agentscan inventories both; portable Agent
Skills checks apply to both, including a shadowed `.agents` copy.
`sourceProvider` is `commandcode` only for `.commandcode` paths.

## Staleness risk: HIGH
