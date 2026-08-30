# Codex skills

**Source:** https://agentskills.io/specification
**Read:** 2026-08-30
**Depends on it:** `agent-skills.skill.*`

Codex loads Agent Skills from `.codex/skills`. Product identity stays `codex`;
the file schema is `agent-skills` (required string `name` and `description`,
name matches the directory).

Supported locations:

- Project-local `.codex/skills` (including nested package roots)
- Global `~/.codex/skills` when `--global` / `includeGlobal` is on

There is no separate Codex skill schema in this capture. Do not invent
Codex-only frontmatter fields.

## Staleness risk: HIGH
