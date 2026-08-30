# AGENTS.md — portable instruction files

**Source:** https://agents.md/
**Read:** 2026-08-30
**Depends on it:** nested `AGENTS.md` discovery, `budget.agents-md` (heuristic only)

## Required fields

Quoted FAQ:

> Are there required fields? No. AGENTS.md is just standard Markdown.

Do not invent a required heading or a 150-line load failure.

## Nested files

Quoted:

> Place another AGENTS.md inside each package. Agents automatically read the
> nearest file in the directory tree, so the closest one takes precedence.

Quoted FAQ:

> The closest AGENTS.md to the edited file wins; explicit user chat prompts
> override everything.

## What this tool does not claim

`budget.agents-md` remains a secondary size hint at `info`. It is not
spec-required.

## Staleness risk: LOW
