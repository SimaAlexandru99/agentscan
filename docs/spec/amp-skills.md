# Amp skills

**Source:** https://ampcode.com/docs/customize/skills
**Also:** https://ampcode.com/docs/customize/global-plugins-and-skills (skill locations)
**Read:** 2026-11-14
**Depends on it:** (new)

## Format

Quoted: "Each skill is a directory containing a SKILL.md file with YAML frontmatter:"

```
---
name: my-skill
description: A description of what this skill does
---
# My Skill Instructions
```

Quoted: "Amp lists every discovered skill for the model. The model sees each
skill's name and description and uses them to decide when to load it."

Quoted, folder rule (for hand-edited repositories): "If you edit a repository
directly, put each skill in a top-level directory with SKILL.md directly inside
it. The directory name and the name in SKILL.md must match."

Quoted, duplicate handling: "Amp uses the first skill with a given frontmatter
name."

## Discovery

Quoted: "Amp searches local skill directories recursively, up to five directories
below each skills root." The directory holding `SKILL.md` is the skill.

Order, first match wins for a given `name`:

1. `~/.config/agents/skills/`
2. `~/.agents/skills/`
3. `~/.config/amp/skills/`
4. `.agents/skills/` in the project and searched parent directories
5. `.claude/skills/` in those directories
6. `~/.claude/skills/`
7. `~/.claude/plugins/cache/`
8. Directories in `amp.skills.path`
9. Personal and workspace skill repositories, then official Amp skills

Quoted, project location: "Project skills are saved under .agents/skills/ and
can be committed with the project."

Config switches (user settings): `amp.skills.disableClaudeCodeSkills` skips
`.claude/skills/`, `~/.claude/skills/`, `~/.claude/plugins/cache/`.
`amp.skills.disableGlobalAgentsSkills` skips `~/.config/agents/skills/` and
`~/.agents/skills/`.

## Skill-provided MCP servers

Quoted: "A skill can define MCP servers in a sibling mcp.json file or in the
mcpServers field of its SKILL.md frontmatter. If both are present, Amp uses
mcpServers and ignores mcp.json."

Fields for local servers: `command` (string), `args` (string array, optional),
`env` (object, optional). Fields for remote servers: `url` (string),
`headers` (object, optional). Common: `includeTools` (string array, optional,
"recommended").

Quoted: "Amp sets AMP_SKILL_DIR in each local server's environment to the
absolute path of the skill directory."

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `.agents/skills/<name>/SKILL.md` (and searched parent dirs) | planned |
| Project (Claude-compatible) | `.claude/skills/<name>/SKILL.md` | planned |
| User | `~/.agents/skills/`, `~/.config/agents/skills/`, `~/.config/amp/skills/` | planned |
| User (Claude-compatible) | `~/.claude/skills/` | planned |
| Config path | `amp.skills.path` directories | no, path comes from settings |

## Staleness risk: HIGH

## Unverified

- Whether `name` and `description` are both required. The docs show both in the one example; no statement says a field is mandatory.
- Whether the directory-name match applies to local skill discovery. It is stated only for hand-edited hosted repositories.
- Windows equivalents of `~/.agents/skills/`, `~/.config/agents/skills/` and `~/.config/amp/skills/`. Docs give `~` paths only; they say `amp.skills.path` uses `;` on Windows.
- Whether `mcpServers` in SKILL.md frontmatter takes the same YAML shape as `mcp.json`. The docs show JSON only.
- Hosted repository limits (200 skills, 200 files per skill, 10 MiB per file, 25 MiB per skill) are documented but apply to hosted repos only, not local directories.
- Subagents: no skill-level or agent-definition surface documented on this page. Not verified.
