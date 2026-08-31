# Command Code custom slash commands

**Source:** https://commandcode.ai/docs/reference/slash-commands
**Read:** 2026-08-31
**Depends on it:** inventory of `.commandcode/commands` and
`~/.commandcode/commands`. No spec-required field checks.

## Locations

| Type | Path |
|------|------|
| Project | `<project>/.commandcode/commands/` at the Command Code project root only |
| User | `~/.commandcode/commands/` (`--global`) |

The command name is the markdown filename without `.md`. Subdirectories
namespace the menu label only; `frontend/button.md` and `backend/button.md`
both create `/button`.

The file body is the prompt. Frontmatter is skipped for the menu preview and
is not documented as required. Do not invent required-field checks.

## Staleness risk: MEDIUM
