# Windsurf / Devin Desktop AGENTS.md

**Source:** https://docs.windsurf.com/windsurf/cascade/agents-md (redirects to
https://docs.devin.ai/desktop/devin-local/customizations; the Devin CLI rules
page is https://docs.devin.ai/cli/extensibility/rules.md)
**Read:** 2026-11-14
**Depends on it:** nested `AGENTS.md` / `agents.md` discovery

The old memories-page reference is also a redirect to the same page.

## Filenames

Quoted (read 2026-11-14, Devin Local page):

> The simplest way to add rules is an `AGENTS.md` file at your project root. It
> uses plain Markdown with no frontmatter

> `AGENTS.md`, `AGENTS.local.md` (for personal rules you keep out of version
> control), and `AGENT.md` are all read as always-on rules.

CHANGED-MEANING (2026-11-14): the quote "Case insensitive: Both `AGENTS.md` and
`agents.md` are recognized" is no longer on the live page. Lowercase
`agents.md` is not documented on the 2026-11-14 pages, so it stays in the spec
only as an unverified legacy claim. The new names `AGENTS.local.md` and
`AGENT.md` are not read by this scanner yet. Rules affected: nested
`AGENTS.md` / `agents.md` discovery.

This scanner already walks nested `AGENTS.md` as portable
(`sourceProvider: "unknown"`). `agents.md` is the same portable surface.
Do not claim every `AGENTS.md` is Windsurf-owned.

## Scoping

CHANGED-MEANING (2026-11-14): the old split (root = always-on, subdirectory =
`/**` glob applied only when files in that directory are read) is replaced.
The live Devin Local page says:

> The agent reads them at the workspace root and in each directory between the
> workspace root and the directory it is working in, so an `AGENTS.md` in a
> subdirectory gives directory-specific guidance.

The Devin CLI page says subdirectory files "are discovered lazily when the
agent accesses files in that directory". Both pages call every such file an
always-on rule. Rules affected: nested `AGENTS.md` / `agents.md` discovery
(nested files now load lazily but are not labelled as glob-scoped).

The git-root discovery quote is on the JetBrains Cascade memories page
(https://docs.devin.ai/windsurf/plugins/cascade/memories.md, 2026-11-14),
not on the Devin Local page:

> Git repository structure: For git repositories, Windsurf also searches up to
> the git root directory to find rules in parent directories

This scanner inventories the files. It does not invent a runtime
glob-application check.

## Size

No Windsurf line or character budget is quoted for `AGENTS.md`. Do not emit
`windsurf.rule.too-large` or `cursor.rule.too-large` for these files.
`budget.agents-md` stays the portable heuristic.

Quoted (2026-11-14, Devin Local page):

> `AGENTS.md` … uses plain Markdown with no frontmatter

Do not emit `windsurf.rule.missing-trigger` on `AGENTS.md` / `agents.md`.

## Unread

- Devin Local / Devin CLI rules paths beyond the `AGENTS.md` family quoted
  above (for example `~/.config/devin/AGENTS.md` and `%APPDATA%\devin\AGENTS.md`,
  per the Devin CLI rules page). Not read by this scanner.
- Applying Windsurf-only ownership to every portable `AGENTS.md`

## Staleness risk: HIGH
