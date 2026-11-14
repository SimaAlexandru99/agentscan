# Zed rules and instructions

**Source:** https://zed.dev/docs/ai/instructions
**Also:** https://github.com/zed-industries/zed/blob/main/docs/src/ai/instructions.md (read 2026-11-14)
**Replaces:** https://zed.dev/docs/ai/rules (now HTTP 404; its content moved to Instructions and Skills)
**Read:** 2026-11-14
**Depends on it:** (new)

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| Personal (Linux, macOS) | `~/.config/zed/AGENTS.md` | yes (planned) |
| Personal (Windows) | `%APPDATA%\Zed\AGENTS.md` | yes (planned, Windows only) |
| Project | first match of the list below, at the worktree root | yes (planned) |

## Personal instructions

Quoted:

> Create or edit:
>
> ```text
> ~/.config/zed/AGENTS.md
> ```
>
> On Windows, the equivalent file is under `%APPDATA%\Zed\AGENTS.md`.

## Project instruction lookup

Quoted: "Zed uses the first matching file in this list:"

1. `.rules`
2. `.cursorrules`
3. `.windsurfrules`
4. `.clinerules`
5. `.github/copilot-instructions.md`
6. `AGENT.md`
7. `AGENTS.md`
8. `CLAUDE.md`
9. `GEMINI.md`

Only the first match is loaded. `.rules` therefore outranks `AGENTS.md` and
`CLAUDE.md` when both exist. Quoted precedence: "Project instructions override
personal `AGENTS.md` when they conflict."

The list is a first-match list. Zed does not load several project files at once.

## Support by agent path

Quoted table row for Zed Agent:

> `CLAUDE.md` | Loaded as compatible project instructions by Zed Agent | Claude reads natively | Claude Code CLI reads natively

External Agents and Terminal Threads may read their own native files. The page
says: "Do not assume Zed's instruction loader controls those agents."

## Migration from Rules

Quoted:

> Rules have been replaced by Skills and Instructions:
> - reusable, on-demand Rules become Skills
> - default, always-on Rules become personal `AGENTS.md`
> - project `.rules` files remain supported as compatibility project instruction files

## Unverified

- Whether the lookup is case-sensitive, and whether `AGENTS.md` in a subdirectory is read. The page only says "project instruction files" and does not mention subdirectories.
- Exact behavior when the first match is empty. Not documented.
- Whether `.rules` has a required format (plain text vs. Markdown). The Zed docs list it under the Markdown file type only in settings `file_types`; the instruction page does not state a format.

## Staleness risk: HIGH
