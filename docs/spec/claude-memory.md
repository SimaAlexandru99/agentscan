# Claude Code memory — CLAUDE.md and `.claude/rules/`

**Source:** https://code.claude.com/docs/en/memory
**Read:** 2026-09-02
**Depends on it:** `budget.claude-md`, walk-up `CLAUDE.md` discovery, `.claude/rules/` inventory

## Project locations

Quoted:

> Project instructions: `./CLAUDE.md` or `./.claude/CLAUDE.md`

> CLAUDE.md and CLAUDE.local.md files in the directory hierarchy above the
> working directory are loaded at launch.

## Load order

Quoted:

> Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from your current working
> directory and every directory above it.

> All discovered files are concatenated into context rather than overriding
> each other.

## Size

Quoted:

> Size: target under 200 lines per CLAUDE.md file. Longer files consume more
> context and reduce adherence.

That is a vendor recommendation. `budget.claude-md` stays `info`.

## Rules directory

Quoted:

> Place markdown files in your project's `.claude/rules/` directory. […] All
> `.md` files are discovered recursively.

No numeric line budget is stated for individual rule files. Do not apply
`budget.agents-md` or invent a 150-line rule limit.

## Staleness risk: MEDIUM
