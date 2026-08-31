# Windsurf / Devin Desktop memories and rules

**Source:** https://docs.windsurf.com/windsurf/cascade/memories
**Read:** 2026-08-31
**Depends on it:** `windsurf.rule.too-large`, `windsurf.rule.global-too-large`,
`windsurf.rule.missing-trigger`

Memories apply to the legacy Cascade agent. Auto-generated memories live under
`~/.codeium/windsurf/memories/` and are **unread** except the quoted
`global_rules.md` file. System / enterprise rule directories are unread.

## Workspace rules

Quoted (read 2026-08-31):

> Workspace | `.devin/rules/*.md` (preferred) or `.windsurf/rules/*.md`
> (fallback) | One file per rule, each with its own activation mode. Limited
> to 12,000 characters per file. The legacy single-file `.windsurfrules` at
> the workspace root is also still read.

Quoted discovery:

> Current workspace and sub-directories: All `.devin/rules` (and legacy
> `.windsurf/rules`) directories within your current workspace and its
> sub-directories
>
> Git repository structure: For git repositories, Devin Desktop also searches
> up to the git root directory to find rules in parent directories

`.devin/` is preferred and takes precedence, with `.windsurf/` kept as a
fallback. This scanner inventories both trees when both exist. It does not
invent a same-name replace — the page only says the product looks at `.devin`
first.

Quoted size:

> Workspace rule files are limited to 12,000 characters each.

`windsurf.rule.too-large` is `info` (vendor-recommendation). Do not apply
`cursor.rule.too-large` (500 lines).

## Activation (`trigger`)

Quoted:

> Each workspace rule declares an activation mode in its frontmatter via the
> `trigger` field.

| Mode | `trigger:` value |
|------|------------------|
| Always On | `always_on` |
| Model Decision | `model_decision` |
| Glob | `glob` (uses `globs`) |
| Manual | `manual` |

`windsurf.rule.missing-trigger` fires on workspace `*.md` files under
`.devin/rules/` or `.windsurf/rules/` that omit a non-empty `trigger`.
Never on `.windsurfrules`, `global_rules.md`, or `AGENTS.md` / `agents.md`.

Quoted:

> The global rules file (`global_rules.md`) and root-level `AGENTS.md` files
> don't use frontmatter — they are always on.

## Global rules

Quoted:

> Global | `~/.codeium/windsurf/memories/global_rules.md` | Single file,
> applied across all workspaces. Always on. Limited to 6,000 characters.

> The global rules file is limited to 6,000 characters.

Opened only with `--global`. Do not glob the rest of
`~/.codeium/windsurf/memories/`.

`windsurf.rule.global-too-large` is `info` (vendor-recommendation).

## Unread

- Auto-generated memories under `~/.codeium/windsurf/memories/` other than
  `global_rules.md`
- System / enterprise: `/etc/devin/rules/`, `/etc/windsurf/rules/`,
  `/Library/Application Support/Devin/rules/`,
  `/Library/Application Support/Windsurf/rules/`,
  `C:\ProgramData\Devin\rules\`, `C:\ProgramData\Windsurf\rules\`
- Workflows and skills (other pages)

## Staleness risk: HIGH
