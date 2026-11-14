# VS Code custom instructions

**Source:** https://code.visualstudio.com/docs/agent-customization/custom-instructions
**Read:** 2026-11-14
**Reference (format and location tables, 2026-11-14):** https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference
**Depends on it:** discovery of `.github/copilot-instructions.md` and
`.github/instructions/*.instructions.md`

## Project-wide file

Quoted (reference page table, 2026-11-14, Copilot row):

> `.github/copilot-instructions.md` or `AGENTS.md`

The 2026-08-30 sentence ("VS Code automatically detects a
`.github/copilot-instructions.md` ...") is no longer on the page. Changed
2026-11-14: `AGENTS.md` is now also listed as a Copilot project file (new,
not in the 2026-08-30 capture). Page wording: "The harness includes guidance
from its project instruction files."

## Targeted files

Quoted (2026-11-14):

> An `*.instructions.md` file contains an optional YAML header between `---`
> delimiters, followed by Markdown instructions

The 2026-08-30 sentence ("Instructions files are Markdown files with the
`.instructions.md` extension.") is no longer on the page (reworded).

Default location is `.github/instructions/**/*.instructions.md` (the page's
glob, which includes subdirectories). Frontmatter
fields `name`, `description`, and `applyTo` are **optional**.

Do not emit missing-name / missing-description errors for these files.

## Staleness risk: HIGH
