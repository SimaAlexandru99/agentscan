# VS Code custom instructions

**Source:** https://code.visualstudio.com/docs/agent-customization/custom-instructions
**Read:** 2026-08-30
**Depends on it:** discovery of `.github/copilot-instructions.md` and
`.github/instructions/*.instructions.md`

## Project-wide file

Quoted:

> VS Code automatically detects a `.github/copilot-instructions.md` Markdown
> file in the root of your workspace and applies the instructions in this file
> to all chat requests within this workspace.

## Targeted files

Quoted:

> Instructions files are Markdown files with the `.instructions.md` extension.

Default location is `.github/instructions` (and subdirectories). Frontmatter
fields `name`, `description`, and `applyTo` are **optional**.

Do not emit missing-name / missing-description errors for these files.

## Staleness risk: HIGH
