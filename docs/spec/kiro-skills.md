# Kiro skills

**Source:** https://kiro.dev/docs/skills/
**Read:** 2026-09-07
**Depends on it:** `agent-skills.skill.*` on `.kiro/skills`

Quoted: Kiro supports the Agent Skills open standard.

## Locations

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `.kiro/skills/` | yes |
| User | `~/.kiro/skills/` | `--global` only |

Quoted: `name` must match folder name; `description` required (max 1024).

Workspace skills take priority over global skills of the same name. This
scanner inventories both; it does not simulate override as runtime.

## Staleness risk: MEDIUM
