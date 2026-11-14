# Windsurf / Devin Desktop memories and rules

**Source:** https://docs.windsurf.com/windsurf/cascade/memories (redirects to
https://docs.devin.ai/desktop/devin-local/customizations). The 12,000-character
limit and the discovery quote now live on
https://docs.devin.ai/windsurf/plugins/cascade/memories.md (JetBrains Cascade).
**Read:** 2026-11-14
**Depends on it:** `windsurf.rule.too-large`, `windsurf.rule.global-too-large`,
`windsurf.rule.missing-trigger`

Memories apply to the legacy Cascade agent. Auto-generated memories live under
`~/.codeium/windsurf/memories/` and are **unread** except the quoted
`global_rules.md` file. System / enterprise rule directories are unread.

## Workspace rules

Quoted (read 2026-11-14, Devin Local page):

> `.devin/rules/*.md` … One rule per file … Each file can declare when it
> applies with `trigger` frontmatter.

> The legacy `.windsurf/rules/*.md`, `.windsurf/global_rules.md`, and
> `.windsurfrules` files are imported by default. Rule files in both
> `.devin/rules/` and `.windsurf/rules/` load; when both `global_rules.md`
> files exist, only `.devin/global_rules.md` loads.

CHANGED-MEANING (2026-11-14): the old "`.devin/` preferred, `.windsurf/`
fallback" wording is replaced by "both load". The CLI page says `.devin/` takes
precedence over `.windsurf/` for `global_rules.md` only. Rules affected:
`windsurf.rule.missing-trigger` (scope of the workspace tree).

Quoted discovery (JetBrains Cascade page, read 2026-11-14):

> Current workspace and sub-directories: All `.windsurf/rules` directories
> within your current workspace and its sub-directories
>
> Git repository structure: For git repositories, Windsurf also searches up to
> the git root directory to find rules in parent directories

The Devin Local page itself does not state a git-root search. The Devin CLI
page reads rules "at the workspace root and in each directory between the
workspace root and your current directory". This scanner inventories both
trees when both exist.

CHANGED-MEANING: the 12,000-character limit is absent from the Devin Local
page. The JetBrains Cascade page still says `Rules files are limited to 12000
characters each.` (no comma).

`windsurf.rule.too-large` is `info` (vendor-recommendation). Do not apply
`cursor.rule.too-large` (500 lines).

## Activation (`trigger`)

Quoted (2026-11-14, Devin Local page; the old "activation mode" sentence is no
longer on it):

> `trigger:` value | When the rule reaches the agent
> `always_on` | Every session … `glob` | … `globs` … `model_decision` | … `manual` | Only when you invoke it

| Mode | `trigger:` value |
|------|------------------|
| Always On | `always_on` |
| Model Decision | `model_decision` |
| Glob | `glob` (uses `globs`) |
| Manual | `manual` |

The Devin CLI rules page also lists `agent` as a `trigger` value
(2026-11-14). It is not on the Devin Local page, so it is not added here.

`windsurf.rule.missing-trigger` fires on workspace `*.md` files under
`.devin/rules/` or `.windsurf/rules/` that omit a non-empty `trigger`.
Never on `.windsurfrules`, `global_rules.md`, or `AGENTS.md` / `agents.md`.

Quoted (Devin Local page, 2026-11-14):

> `AGENTS.md`, `AGENTS.local.md` … and `AGENT.md` are all read as always-on rules.

## Global rules

CHANGED-MEANING (2026-11-14): the global path is no longer
`~/.codeium/windsurf/memories/global_rules.md`. The live docs say:

> Place the same files in your home directory (`~/.devin/rules/*.md`,
> `~/.devin/global_rules.md`) to apply them to every project.

The old 6,000-character limit for `global_rules.md` is not found in any of the
211 live docs pages checked. Rules affected: `windsurf.rule.global-too-large`
(now has no vendor source; `info` severity should be reconsidered).

Opened only with `--global`. Do not glob the rest of
`~/.codeium/windsurf/memories/`. The legacy path is no longer documented as the
global rules location.

## Unread

- Auto-generated memories under `~/.codeium/windsurf/memories/` other than
  `global_rules.md`
- System / enterprise rules: CHANGED-MEANING (2026-11-14). The live enterprise
  page (https://docs.devin.ai/desktop/controls.md) says `rules/*.md` lives in
  `/Library/Application Support/Devin/` (macOS), `C:\ProgramData\Devin\`
  (Windows) and `/etc/devin/` (Linux/WSL). The legacy `Windsurf` locations are
  a fallback, read only when the `Devin` one is missing, per subdirectory or
  file, and never merged. Still unread by agentscan.
- Workflows and skills (other pages)

## Staleness risk: HIGH

> **Severity note (2026-11-13):** `windsurf.rule.missing-trigger` reports at
> `info`. The page requires a `trigger` but does not say what happens without
> one, and a 2026-11-13 audit found every hit in plugin-cache copies Windsurf
> never reads. Under `--global` those copies are skipped.
