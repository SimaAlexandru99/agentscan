# Codex AGENTS.md instruction chain

**Source:** https://learn.chatgpt.com/docs/agent-configuration/agents-md
**Read:** 2026-08-30
**Depends on it:** `codex.budget.instructions`

## Discovery

Quoted:

> Project scope: Starting at the project root (typically the Git root), Codex
> walks down to your current working directory. […] In each directory along the
> path, it checks for `AGENTS.override.md`, then `AGENTS.md` […] Codex includes
> at most one file per directory.

> Merge order: Codex concatenates files from the root down […] Files closer to
> your current directory override earlier guidance

## Byte budget

Quoted:

> Codex skips empty files and stops adding files once the combined size reaches
> the limit defined by `project_doc_max_bytes` (32 KiB by default).

This is cumulative across the chain, not a per-file Claude budget. Do not apply
it to `CLAUDE.md`.

Global `~/.codex/AGENTS.md` is outside a normal project scan.

## Staleness risk: HIGH
