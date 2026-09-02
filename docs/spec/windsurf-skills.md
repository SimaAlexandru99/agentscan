# Windsurf / Cascade skills

**Source:** https://docs.devin.ai/desktop/cascade/skills
**Read:** 2026-08-31
**Depends on it:** `agent-skills.skill.*`, `skill.missing-skill-md`,
`skill.broken-reference`

Quoted: Cascade uses progressive disclosure (`name` and `description` at
listing time). For the rest of the Skills specification the page points at
https://agentskills.io/specification. Product identity stays `windsurf`;
the file schema is `agent-skills`. Do not apply Claude listing-budget
checks or Grok optional-name fallbacks.

The Devin Local agent uses a different skills format — unread.

## Locations

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `.windsurf/skills/<name>/SKILL.md` | yes |
| User | `~/.codeium/windsurf/skills/<name>/SKILL.md` | `--global` only |
| System | `/etc/windsurf/skills/`, macOS `/Library/Application Support/Windsurf/skills/`, Windows `C:\ProgramData\Windsurf\skills\` | unread |

Quoted compatibility (keep on their own providers; do not relabel as Windsurf):

> For cross-agent compatibility, Devin Desktop also discovers skills in
> `.agents/skills/` and `~/.agents/skills/`. If you have enabled Claude Code
> config reading, `.claude/skills/` and `~/.claude/skills/` are scanned as well.

## Frontmatter

Quoted required fields:

> **name**: Unique identifier for the skill (displayed in UI and used for @-mentions)
> **description**: Brief explanation shown to the model to help it decide when to invoke the skill

Quoted UI name charset: lowercase letters, numbers, and hyphens only.
Valid examples on the page: `deploy-to-staging`, `code-review`,
`setup-dev-environment`.

A readable `SKILL.md` with no `---` block is
`agent-skills.skill.missing-frontmatter`. Missing `name` / `description`
and the Agent Skills name contract (directory match, 64 / 1024, no
consecutive hyphens) apply because this page defers the rest of the
format to agentskills.io.

## Staleness risk: HIGH
