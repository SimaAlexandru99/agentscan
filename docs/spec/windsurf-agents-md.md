# Windsurf / Devin Desktop AGENTS.md

**Source:** https://docs.windsurf.com/windsurf/cascade/agents-md
**Read:** 2026-08-31
**Depends on it:** nested `AGENTS.md` / `agents.md` discovery

Also named on https://docs.windsurf.com/windsurf/cascade/memories (AGENTS.md
is processed by the same Rules engine).

## Filenames

Quoted (read 2026-08-31):

> When you create an `AGENTS.md` file (or `agents.md`), Devin Desktop
> automatically discovers it

> Case insensitive: Both `AGENTS.md` and `agents.md` are recognized

> The file uses plain markdown with no special frontmatter required.

This scanner already walks nested `AGENTS.md` as portable
(`sourceProvider: "unknown"`). `agents.md` is the same portable surface.
Do not claim every `AGENTS.md` is Windsurf-owned.

## Scoping

Quoted:

> Root directory: Treated as an always-on rule — the full content is included
> in Cascade's system prompt on every message.
>
> Subdirectories: Treated as a glob rule with an auto-generated pattern of
> `/**` — the content is applied only when Cascade reads or edits files
> inside that directory.

Quoted discovery:

> Workspace scanning: All `AGENTS.md` files within your workspace and its
> subdirectories are discovered
>
> Git repository support: For git repositories, Devin Desktop also searches
> parent directories up to the git root

This scanner inventories the files. It does not invent a runtime
glob-application check.

## Size

No Windsurf line or character budget is quoted for `AGENTS.md`. Do not emit
`windsurf.rule.too-large` or `cursor.rule.too-large` for these files.
`budget.agents-md` stays the portable heuristic.

Quoted from the memories page:

> The global rules file (`global_rules.md`) and root-level `AGENTS.md` files
> don't use frontmatter — they are always on.

Do not emit `windsurf.rule.missing-trigger` on `AGENTS.md` / `agents.md`.

## Unread

- Devin Local “CLI rules system” paths that this page does not publish
- Applying Windsurf-only ownership to every portable `AGENTS.md`

## Staleness risk: HIGH
