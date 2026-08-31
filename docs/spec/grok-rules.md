# Grok Build project rules and AGENTS.md family

**Source:** https://docs.x.ai/build/features/project-rules
**Read:** 2026-08-31
**Depends on it:** discovery of `.grok/rules/*.md`, `Agents.md`, `AGENT.md`

Also consulted: https://docs.x.ai/build/features/skills-plugins-marketplaces
(Agents.md compatibility list).

## Instruction files

Quoted family walked from cwd to the repo root:

`AGENTS.md`, `Agents.md`, `AGENT.md`

Claude names (`CLAUDE.md`, `Claude.md`, `CLAUDE.local.md`) stay Claude-owned.
This scanner already walks `AGENTS.md`. `Agents.md` and `AGENT.md` are
inventoried as Grok instruction files (`sourceProvider: grok`).

Quoted:

> Files are loaded in full, with no size cap

Do not emit a Grok line-budget check. Do not apply `cursor.rule.too-large`.

Quoted:

> Files ignored by `.gitignore` are skipped

agentscan does not honor `.gitignore`. Gitignored instruction files stay
**unread** as a Grok-specific filter.

## `.grok/rules/`

Quoted: every `*.md` file in a `.grok/rules/` directory. Inventoried with
`sourceProvider: grok`. No published line budget.

`.claude/rules/` and `.cursor/rules/` are compatibility reads and stay on
those providers.

## Global rules

Quoted: global rules in `~/.grok/`. That path is not a filename pattern.
User-global instruction files other than the documented `~/.grok/skills`
and `~/.grok/hooks` trees are unread.

## Staleness risk: HIGH
