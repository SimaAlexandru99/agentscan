# Command Code memory

**Source:** https://commandcode.ai/docs/memory
**Read:** 2026-08-31
**Depends on it:** discovery of `AGENTS.md` / `.commandcode/AGENTS.md` per directory; no
hard error for unresolved `@path` imports

Command Code reads `AGENTS.md`, not `CLAUDE.md`.

## Tiers (all that exist are loaded)

| Tier | Path |
|------|------|
| User | `~/.commandcode/AGENTS.md` (`--global`) |
| Project | `<project>/AGENTS.md`, else `<project>/.commandcode/AGENTS.md` |
| Subdirectory | `<dir>/AGENTS.md`, else `<dir>/.commandcode/AGENTS.md` |

Quoted table (read 2026-08-31): subdirectory memory is `AGENTS.md` **or**
`.commandcode/AGENTS.md`. Quoted project/user fallback: both names are checked,
in that order — **the first one that exists is used, not both**. That pair is
per directory, including nested `<dir>/.commandcode/AGENTS.md`.

At most one memory file per directory (the first of `AGENTS.md` /
`.commandcode/AGENTS.md`). Preserve outermost-to-nearest ordering in facts
(`hopsFromStart`).

## `@path` imports

- Relative to the importing file; `~/` is home; absolute paths work
- Recursive, up to 5 levels
- Fenced / backticked `@` is not an import
- Quoted: "A path that doesn't resolve to a readable file is left as plain
  text rather than failing the turn."

Do **not** treat unresolved `@path` imports as hard errors.

No published line budget. `budget.agents-md` stays a heuristic on any
`AGENTS.md` basename and is not a Command Code requirement.

## Staleness risk: HIGH
