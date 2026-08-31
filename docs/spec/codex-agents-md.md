# Codex AGENTS.md instruction chain

**Source:** https://learn.chatgpt.com/docs/agent-configuration/agents-md
**Also:** https://learn.chatgpt.com/docs/config-file/config-advanced
**Read:** 2026-08-31
**Depends on it:** `codex.budget.instructions`

## Discovery

Quoted precedence:

1. Global scope (`~/.codex`, or `CODEX_HOME`): `AGENTS.override.md` if it
   exists, otherwise `AGENTS.md`. Only the first non-empty file at this level.
   Scanned under `--global`.
2. Project scope: starting at the project root, walk down to cwd. In each
   directory: `AGENTS.override.md`, then `AGENTS.md`, then
   `project_doc_fallback_filenames`. At most one file per directory.
3. Merge order: root down, later files override earlier guidance.

Quoted:

> Codex skips empty files and stops adding files once the combined size reaches
> the limit defined by `project_doc_max_bytes` (32 KiB by default).

Do not apply this budget to `CLAUDE.md`. Do not include
`.commandcode/AGENTS.md` on the Codex chain.

## Config knobs (`.codex/config.toml`)

Quoted from config-advanced (read 2026-08-31):

- `project_doc_max_bytes` — combined size cap (default 32 KiB).
- `project_doc_fallback_filenames` — extra names after `AGENTS.md` in each
  directory (for example `["TEAM_GUIDE.md", ".agents.md"]`).
- `project_root_markers` — directories that mark the project root (default
  `.git`). `project_root_markers = []` treats cwd as the root and does not
  search parents.

## Staleness risk: HIGH
