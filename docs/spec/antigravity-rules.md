# Antigravity rules

**Source:** https://antigravity.google/docs/rules
**Read:** 2026-11-12
**Depends on it:** `antigravity.rule.*`

Rules are cumulative. The scanner opens the workspace files below on the
ancestor walk (the start directory and parents up to the scan root). It does
not open a rules directory in a subdirectory below the start directory.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Workspace | `<dir>/GEMINI.md` | yes, as an Antigravity rule. No frontmatter check |
| Workspace | `<dir>/.agents/GEMINI.md` | yes, same |
| Workspace | `<dir>/AGENTS.md` and `<dir>/.agents/AGENTS.md` | already a policy file (`budget.agents-md`). Not a second Antigravity rule, so the 24,000-byte check does not apply |
| Workspace | `<dir>/.agents/rules/*.md` | yes, one directory level, frontmatter required |
| Workspace | `<dir>/.agent/rules/*.md` | yes, the quoted legacy path, same rules |
| Workspace | `<dir>/.agents/rules.json` | shape only. `inherits` and `entries` paths are not followed |
| Global | `~/.gemini/AGENTS.md`, `~/.gemini/GEMINI.md`, `~/.gemini/config/AGENTS.md`, `~/.gemini/config/GEMINI.md` | `--global` only. No frontmatter check |
| Global | `~/.gemini/config/rules/*.md` | `--global` only, one directory level |

Unread: plugin rules under `~/.gemini/config/plugins/<plugin>/rules/`, and any
global `rules.json` (the page does not quote one). A dotfile in `rules/` is
skipped. A nested `rules/<subdir>/*.md` is skipped.

## Frontmatter

`AGENTS.md` and `GEMINI.md` do not use frontmatter. A modular file with
unclosed, invalid, or non-mapping YAML is one unexpected-shape config error
and no `antigravity.rule.*` defect.

Otherwise one defect, in this order:

1. `trigger` missing or empty → `antigravity.rule.missing-trigger`
2. `trigger` not `always_on`, `model_decision`, `glob`, or `manual` → `antigravity.rule.invalid-trigger`
3. `model_decision` without a non-empty string `description` → `antigravity.rule.missing-description`
4. `glob` without a non-empty string `globs` or `glob` → `antigravity.rule.missing-globs`

`always_on` and `manual` need only `trigger`. `description` is not required
for them. `globs` is a string, not an array.

## Size

`antigravity.rule.too-large` (warning, spec-required) fires when the raw file
is over 24,000 bytes. 24,000 is not over. A trigger defect and this check can
both fire on the same file.

The page truncates after expanding `@[label](path)` includes. This check
counts the file on disk, so a file under 24,000 bytes can still be truncated
after an include. That is a false negative. The 20,000-token aggregate budget
is not checked. A file past the 100,000-byte scan cap still counts as over
24,000; the reported size is the cap, not the full file.
