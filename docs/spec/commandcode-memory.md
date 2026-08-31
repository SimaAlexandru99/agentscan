# Command Code memory

**Source:** https://commandcode.ai/docs/memory
**Read:** 2026-08-31
**Depends on it:** discovery of `AGENTS.md` / `.commandcode/AGENTS.md`; no
hard error for unresolved `@path` imports

Command Code reads `AGENTS.md`, not `CLAUDE.md`.

## Tiers (all that exist are loaded)

| Tier | Path |
|------|------|
| User | `~/.commandcode/AGENTS.md` (`--global`) |
| Project / subdirectory | `<dir>/AGENTS.md`, else `<dir>/.commandcode/AGENTS.md` |

Quoted: both `AGENTS.md` and `.commandcode/AGENTS.md` are checked, in that
order — **the first one that exists is used, not both**. At most one memory
file per directory.

Walk from cwd up to the project root, outermost first, nearest last.
Preserve that outermost-to-nearest ordering in facts (`hopsFromStart`).

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
