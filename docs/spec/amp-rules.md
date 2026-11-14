# Amp rules (AGENTS.md)

**Source:** https://ampcode.com/docs/customize/agents-md
**Also:** https://ampcode.com/docs/cli/settings (managed-settings paths)
**Read:** 2026-11-14
**Depends on it:** (new)

## Lookup

Quoted: "Amp looks in AGENTS.md files for guidance on codebase structure,
build/test commands, and conventions."

Quoted: "AGENTS.md files in the current working directory (or editor workspace
roots) and parent directories (up to $HOME) are always included."

Quoted: "Subtree AGENTS.md files are included when the agent reads a file in the
subtree."

Quoted: "If no AGENTS.md exists in a directory, but a file named AGENT.md (without
an S) or CLAUDE.md does exist, that file will be included."

So the ancestor walk stops at `$HOME`. A `CLAUDE.md` or `AGENT.md` stands in
for a directory's missing `AGENTS.md`, per directory.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `AGENTS.md` in cwd and each parent up to `$HOME` (fallback `AGENT.md` or `CLAUDE.md` per directory) | planned |
| Project subtree | `AGENTS.md` in subdirectories, included only when the agent reads a file there | no, read is agent-driven |
| User | `$HOME/.config/amp/AGENTS.md`, `$HOME/.config/AGENTS.md` | planned |
| System (Linux) | `/etc/ampcode/AGENTS.md` | planned |
| System (macOS) | `/Library/Application Support/ampcode/AGENTS.md` | planned |
| System (Windows) | `%ProgramData%\ampcode\AGENTS.md` | planned |

Quoted, system guidance: "System-wide guidance files, as well as both
$HOME/.config/amp/AGENTS.md and $HOME/.config/AGENTS.md, are always included if
they exist."

Quoted, ignore switch: "Set AMP_IGNORE_GUIDANCE_FILES to a colon-delimited (:)
list of globs to skip matching guidance files." `AMP_IGNORE_GUIDANCE_FILES='*'`
disables all automatic AGENTS.md loading.

## Granular guidance

Quoted: "To provide guidance that only applies when working with certain files,
you can specify globs in YAML front matter of mentioned files." Frontmatter key:
`globs` (list). "Mentioned files with globs will only be included if Amp has
read a file matching any of the globs." A file with no `globs` is always included
when @-mentioned.

@-mentions (`@doc/style.md`, `@.agent/**/*.md`) pull other files in. They are
ignored inside code blocks. `@~/...` is allowed; absolute paths are not.

## Staleness risk: HIGH

## Unverified

- Windows path for the user-level `$HOME/.config/amp/AGENTS.md`. The docs give only `$HOME` form; the Windows system path is documented.
- Whether `$HOME` expands to `%USERPROFILE%` on Windows for the upward walk limit.
- Whether `.agents/AGENTS.md` or other nested names are read. Not documented.
- Whether `AGENTS.md` is read when no Git repository exists. Docs say "cwd (or editor workspace roots)"; no repo-root rule is stated.
- Subagents do not receive workspace guidance ("It does not apply to subagents, Puck, or raw custom agents"). Whether project AGENTS.md reaches subagents is not stated.
- Hooks: not part of this surface. Not written.
