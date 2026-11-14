# Windsurf / Cascade skills

**Source:** https://docs.devin.ai/desktop/cascade/skills (redirects to
https://docs.devin.ai/desktop/devin-local/customizations)
**Read:** 2026-11-14
**Depends on it:** `agent-skills.skill.*`, `skill.missing-skill-md`,
`skill.broken-reference`

Quoted (2026-11-14, Devin Local page): skills use progressive disclosure. Only
the skill's `name` and `description` are shown to the model by default. For the
rest of the Skills specification the Devin CLI page points at
https://agentskills.io/specification. Product identity stays `windsurf`;
the file schema is `agent-skills`. Do not apply Claude listing-budget
checks or Grok optional-name fallbacks.

CHANGED-MEANING (2026-11-14): the old "The Devin Local agent uses a different
skills format — unread" is no longer true. The live page says: "Because Devin
Local shares its agent harness with Devin CLI, every customization uses the
Devin CLI format and discovery". So Devin Local skills are read through the
Devin CLI rules (see [devin-hooks.md](devin-hooks.md) for the shared CLI
surface). Rules affected: `agent-skills.skill.*`, `skill.missing-skill-md`,
`skill.broken-reference`.

## Locations

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace (primary) | `.devin/skills/<name>/SKILL.md` | not checked in this refresh; the Devin CLI reader is the owner (CHANGED-MEANING) |
| Workspace (legacy) | `.windsurf/skills/<name>/SKILL.md` (also read by Devin) | yes |
| Global (primary) | `~/.config/devin/skills/<name>/SKILL.md` (`%APPDATA%\devin\skills\` on Windows) | `--global` only; not checked in this refresh |
| Global (legacy) | `~/.codeium/windsurf/skills/<name>/SKILL.md` (`~/.codeium/<channel>/skills/` for windsurf, windsurf-next, windsurf-insiders) | `--global` only |
| System | CHANGED-MEANING 2026-11-14: `/etc/devin/skills/`, macOS `/Library/Application Support/Devin/skills/`, Windows `C:\ProgramData\Devin\skills\`, with `…/Windsurf/skills/` as a fallback only when the Devin location is missing (https://docs.devin.ai/desktop/controls.md) | unread |

Quoted (2026-11-14, Devin Local page) on the workspace scope: "`.devin/skills/<name>/`
(`.agents/skills/` and the legacy `.windsurf/skills/` are also read)".

Quoted compatibility (2026-11-14, Devin CLI skills overview; the older Cascade
page quote with `.claude/skills/` is no longer on the Devin pages):

> Devin CLI also reads skills that other tools keep in their own directories,
> such as `.claude/skills/`, `.github/skills/`, `.codex/skills/`, and
> `.kiro/skills/`. See Configuration Import for each tool's locations and how
> to turn one off.

## Frontmatter

Quoted required fields (2026-11-14, Devin Local page):

> **name**: Unique identifier for the skill (lowercase letters, numbers, and hyphens). Used to invoke it.
> **description**: Brief explanation shown to the model to help it decide when to invoke the skill. Be specific about what the skill does and when to use it.

Changed wording: the earlier "displayed in UI and used for @-mentions" is gone.
The live page says "Used to invoke it" and `/skill-name` invocation. Same
constraints, so no rule-meaning change.

Quoted UI name charset: lowercase letters, numbers, and hyphens only.
Valid examples on the page: `deploy-to-production` (2026-11-14).

A readable `SKILL.md` with no `---` block is
`agent-skills.skill.missing-frontmatter`. Missing `name` / `description`
and the Agent Skills name contract (directory match, 64 / 1024, no
consecutive hyphens) apply because this page defers the rest of the
format to agentskills.io.

## Staleness risk: HIGH
