# Goose hints and context files (.goosehints, AGENTS.md)

**Source:** https://goose-docs.ai/docs/guides/context-engineering/using-goosehints/
**Also:** https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-goosehints.md (not fetched as raw; text read from the docs site)
**Read:** 2026-11-14
**Depends on it:** (new)

Goose reads free-text instruction files. The default names are
`AGENTS.md` and `.goosehints`. The names are configurable.

## Default names

Quoted:

> goose looks for AGENTS.md then .goosehints files by default, but you can configure a different filename or multiple context files using the CONTEXT_FILE_NAMES environment variable.

Default value, quoted:

> The default is ["AGENTS.md", ".goosehints"].

Setting the variable:

```bash
export CONTEXT_FILE_NAMES='["AGENTS.md"]'
export CONTEXT_FILE_NAMES='[".cursorrules", "AGENTS.md"]'
```

Quoted lookup rule:

> goose looks for each configured filename in both global (~/.config/goose/) and local project locations

## Locations

Global `.goosehints`, quoted:

> Global hints file - Create a .goosehints file in ~/.config/goose.

Local `.goosehints`, quoted:

> Local hints file - Create a .goosehints file at the root of your project and/or in any directory in the hierarchy.

Global and local hints apply together. Quoted:

> If the instructions in your local hints file conflict with your global preferences, goose will prioritize the local hints.

## Nested loading

Quoted:

> goose supports hierarchical local hints in git repositories. When your session starts, goose loads the configured context files from your working directory up to the repository root.

Also quoted:

> As goose reads or modifies files in nested subdirectories, it can also discover and load additional hint files from those directories automatically.

Nested files stay active for the rest of the session. Restart to pick up
edits, per the docs.

## Format

Plain natural-language text. No frontmatter is documented.

Quoted file-reference syntax:

> @ syntax: Automatically includes the file content in goose's immediate context
> Plain reference: Points goose to files to review when needed

So `@path/to/file.md` inlines the file. A bare path is only a pointer.

## Prerequisite

Quoted:

> To make use of the hints file, you need to have the Developer extension enabled.

## Unverified

- Whether `AGENTS.md` at the project root is loaded when the working
  directory is a subdirectory of the git root. The docs state the walk goes
  "up to the repository root".
- Whether a file named `.goosehints` in a non-git directory is loaded. The
  nested rule says "in git repositories".
- Size limits for hint files. Not stated.
- Whether `@`-references are resolved relative to the hint file or the
  working directory. Not stated.
- Whether hints from `~/.config/goose/AGENTS.md` (the global lookup rule
  applied to the default `AGENTS.md`) are loaded by default. The lookup rule
  says so; no example confirms it.

## Files

| Scope | Path | Proposed agentscan use |
|-------|------|------------------------|
| Global | `~/.config/goose/.goosehints` | read as instruction text |
| Global | `~/.config/goose/AGENTS.md` | read as instruction text (lookup rule) |
| Local | `<project>/.goosehints`, and each directory up to the git root | read as instruction text |
| Local | `<project>/AGENTS.md`, and each directory up to the git root | read as instruction text |
| Custom | any name in `CONTEXT_FILE_NAMES` | read only if the env var is set |

## Staleness risk: HIGH

The hint behaviour is documented as a Desktop and CLI feature. Re-read before
relying on the global-AGENTS.md lookup, which is stated as a rule but not
shown in an example.
