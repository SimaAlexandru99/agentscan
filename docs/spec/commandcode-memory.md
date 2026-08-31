# Command Code memory

**Source:** https://commandcode.ai/docs/memory
**Read:** 2026-08-31
**Depends on it:** discovery of `AGENTS.md` / project-root `.commandcode/AGENTS.md`; no
hard error for unresolved `@path` imports

Command Code reads `AGENTS.md`, not `CLAUDE.md`.

## Tiers (all that exist are loaded)

| Tier | Path |
|------|------|
| User | `~/.commandcode/AGENTS.md` (`--global`) |
| Project | `<project>/AGENTS.md`, else `<project>/.commandcode/AGENTS.md` |
| Subdirectory | `<dir>/AGENTS.md` on the walk from cwd toward the project root |

Quoted project/user fallback: both `AGENTS.md` and `.commandcode/AGENTS.md` are
checked, in that order — **the first one that exists is used, not both**. That
fallback is the project-root (and user) location.

Quoted walk: Command Code "walks from that file's directory up to the project
root and picks up any `AGENTS.md` it finds along the way." Subdirectory memory
is therefore `AGENTS.md` on the path toward the project root. Nested
`<dir>/.commandcode/AGENTS.md` is **not** treated as Command Code memory; the
walk text names `AGENTS.md`, and the `.commandcode/AGENTS.md` fallback is
documented for the project root (and user), not as a per-nested-directory
walk-up location.

At most one memory file at the project root (the first of `AGENTS.md` /
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
