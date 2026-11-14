# Qwen Code rules and context files

**Source (rules):** https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/rules.md
**Source (context file, `QWEN.md`):** https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/ ("Context Files" section and the `context` table)
**Read:** 2026-11-14
**Depends on it:** (new) — proposed `qwen.rule.*` rules

Qwen Code has two instruction surfaces. Both are Markdown. Both are documented
here because the docs describe them as separate mechanisms.

## Context file (`QWEN.md`)

Quoted, settings page:

> context files (defaulting to `QWEN.md` but configurable via the
> `context.fileName` setting)

`context.fileName` is a string or an array of strings. Quoted example:
`"fileName": ["CONTEXT.md", "QWEN.md"]`.

Lookup, quoted:

> Location: `~/.qwen/<configured-context-filename>` (e.g., `~/.qwen/QWEN.md` in
> your user home directory).

> The CLI searches for the configured context file in the current working
> directory and then in each parent directory up to either the project root
> (identified by a `.git` folder) or your home directory.

Contents are concatenated into the system prompt. Imports use `@path/to/file.md`.

## Rules (`.qwen/rules/`)

Quoted, repo docs:

> A rule is a Markdown file that reaches the model either at the start of a
> session or the moment the work touches a file it applies to. Rules live in
> `.qwen/rules/`.

Locations, from the table in the repo docs:

| Location | Loaded |
|----------|--------|
| `~/.qwen/rules/` (or `$QWEN_HOME/rules/`) | always |
| `<project>/.qwen/rules/` | when the workspace is trusted |
| an active extension's `rules/` | always, conditional rules only |

"Every `.md` file under those directories is discovered, including in
subdirectories."

Frontmatter, both fields optional, quoted example:

```
---
description: How we write React components
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.jsx'
---
```

- With `paths:`, a conditional rule, injected once a matching file is touched.
- Without `paths:`, a baseline rule, in the prompt from the first request.
- A file with no frontmatter at all is a baseline rule.
- Globs match relative to the project root, with forward slashes, and match
  dotfiles. HTML comments are stripped before sending.

## Gemini comparison

Gemini's context file is `GEMINI.md` and is not captured in this pass. No reuse
claim is made. The Qwen layout is `QWEN.md` in `~/.qwen/` and the cwd-to-root
ancestor walk. Do not assume Gemini's lookup if the Gemini capture is absent.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Context | `<project>/QWEN.md` and each ancestor up to `.git` or home | planned: yes, name taken from `context.fileName` when set |
| Context | `~/.qwen/QWEN.md` | planned: yes |
| Project rules | `<project>/.qwen/rules/**/*.md` | planned: yes |
| User rules | `~/.qwen/rules/**/*.md` | planned: yes |
| Not opened | `.qwen/QWEN.local.md`, extension context files | no. The first is named in a memory doc, not captured |

## Unverified

- Whether `context.fileName` set in a project `.qwen/settings.json` is honored
  (the `context` category is not stated as operator-only, unlike `ui.*`).
- Whether `.qwen/QWEN.local.md` is a loaded context file. The memory-type text
  in the hooks page names it, but no rule-loading page was read for this pass.
- Whether `rules/` loads `.md` files whose names start with `.`. The docs say
  "every `.md` file" without an exclusion.
- The exact `paths:` glob semantics beyond the examples quoted above.

## Staleness risk: HIGH

The rules doc is recent and says the layout is new. Re-read before a rule
depends on the `paths:` behavior.
