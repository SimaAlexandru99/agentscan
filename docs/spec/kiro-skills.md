# Kiro skills

**Source:** https://kiro.dev/docs/skills/
**Read:** 2026-11-14
**Depends on it:** `agent-skills.skill.*` on `.kiro/skills`

Quoted (2026-11-14): Kiro supports the Agent Skills open standard.

## Locations

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `.kiro/skills/` | yes |
| User | `~/.kiro/skills/` | `--global` only |

Quoted (2026-11-14): `name` | Yes | Must match folder name. Lowercase letters,
numbers, and hyphens only (max 64 chars). `description` | Yes | When to use this
skill … (max 1024 chars). `license` is optional.

Custom agents do not load skills by default; they need `skill://` in their
`resources`. Source: https://kiro.dev/docs/skills/ (unchanged URL).

Workspace skills take priority over global skills of the same name. This
scanner inventories both; it does not simulate override as runtime.

## Staleness risk: MEDIUM
