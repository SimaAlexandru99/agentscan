# Goose skills

**Source:** https://goose-docs.ai/docs/guides/context-engineering/using-skills
**Also:** https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-skills.md
**Read:** 2026-11-14
**Depends on it:** (new)

## Locations

Quoted from the Agent Skills page:

> 1. `~/.agents/skills/` — Global skills, available in all sessions
> 2. `.agents/skills/` — Project-level skills, scoped to the current project
> 3. `~/.agents/plugins/<plugin-name>/` — Skills provided by installed plugins

Backward compatibility, quoted:

> goose also discovers skills from `.goose/skills/`, `.claude/skills/`, `~/.claude/skills/`, and platform-specific config directories, but `agents/skills/` is the recommended standard.

The `.goose/skills/` and `.claude/skills/` paths are discovered, per the docs.
The docs do not say whether those paths use the same frontmatter contract.

## Required file

One directory per skill, with `SKILL.md` directly inside it:

```
~/.agents/skills/
└── code-review/
    └── SKILL.md
```

Quoted:

> A `SKILL.md` file requires YAML frontmatter with `name` and `description`, followed by the skill content:

Quoted example:

```markdown
---
name: code-review
description: Comprehensive code review checklist for pull requests
---

# Code Review Checklist
```

Only `name` and `description` are named as required. No other frontmatter
keys are documented.

## Supporting files

Quoted:

> Skills can include supporting files like scripts, templates, or configuration files. Place them in the skill directory

Layout example from the page: `SKILL.md`, `setup.sh`, `templates/...` beside
it, all inside the skill directory.

## Plugin skills

Quoted:

> For Open Plugins, skill names are namespaced with the plugin name, such as my-plugin:review.

Plugin skills live under `~/.agents/plugins/<plugin-name>/`. Their names are
namespaced `plugin:skill`.

## Discovery

Quoted:

> When a session starts, goose adds discovered skill names and descriptions to its instructions. During the session, goose can load a skill's full instructions when: ...

Skills are loaded on demand. The `/skills` CLI command and `goose skills list`
enumerate them.

## Claude compatibility

Quoted:

> goose skills are compatible with Claude Desktop and other agents that support Agent Skills.

## Built-in skill

`web-search` ships with goose and is always available. The `browser-use` skill
is installed separately (`browser-use skill install`).

## Unverified

- Whether `name` must equal the parent directory name. Not stated.
- Whether `name` / `description` have length or character limits.
- Windows path for user skills (`%APPDATA%` or similar). The docs say only
  "platform-specific config directories" with no paths.
- Whether `SKILL.md` is matched case-sensitively, or whether other filenames
  are accepted.
- Precedence when the same skill name exists in two locations.
- Whether skills are scanned recursively for grouping folders. The page shows
  one level only.
- Whether the frontmatter in `.claude/skills/` or `.goose/skills/` is checked
  against the Agent Skills contract. Not stated.

## Files

| Scope | Path | Proposed agentscan use |
|-------|------|------------------------|
| User | `~/.agents/skills/<name>/SKILL.md` | read, skill rules |
| Project | `.agents/skills/<name>/SKILL.md` | read, skill rules |
| Plugin | `~/.agents/plugins/<plugin>/` | unread (plugin layout not documented here) |
| Compat | `.goose/skills/`, `.claude/skills/`, `~/.claude/skills/` | discovered by goose; contract not documented |

## Staleness risk: HIGH

Skills and plugins are recent additions to the goose docs nav. Re-read before
writing rules against them.
