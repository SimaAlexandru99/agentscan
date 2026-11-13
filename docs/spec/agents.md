# Agent definitions — frontmatter

**Source:** https://code.claude.com/docs/en/sub-agents
**Read:** 2026-11-13
**Depends on it:** `claude.agent.missing-frontmatter`, `claude.agent.missing-description`,
`claude.agent.missing-name`, `claude.agent.invalid-name`, `claude.agent.duplicate-name`
(`src/checks/agents.ts`)

## Frontmatter fields

Quoted (2026-11-13):

| Field | Required | Quoted |
|-------|----------|--------|
| `name` | **Yes** | "Unique identifier of at most 256 characters, such as `code-reviewer` or `reviewer-v2`. Hooks receive this value as `agent_type`. **The filename doesn't have to match.** Names can't contain `:`, which is reserved for plugin-scoped identifiers such as `my-plugin:reviewer`" |
| `description` | **Yes** | When Claude should delegate to this subagent |

Both are required, which is why `claude.agent.missing-name` and
`claude.agent.missing-description` exist here while the equivalent skill checks
do not — for a skill, every frontmatter field is optional and `name` defaults
to the directory. See [skills.md](skills.md).

## Name format

The page no longer says "lowercase letters and hyphens" (it did on
2026-08-31) and gives `reviewer-v2` as an example, so there is no format
regex. `claude.agent.invalid-name` fires only for the documented skip
conditions below, plus an empty name, always at **error**.

Do **not** enforce filename == `name`. Quoted: "The filename doesn't have to
match."

## Documented load failures

Quoted list of "Subagent files Claude Code skips" (read 2026-11-13):

> - **No `name`**: Claude Code treats the file as documentation kept beside your agents.
> - **An opening `---` that isn't the file's first line**: Claude Code reads the
>   file as having no frontmatter and treats it as documentation.
> - **A `name` that starts with `-`, contains `:`, or is longer than 256
>   characters**: Claude Code skips the file and writes an error to the debug log.
> - **A `name` but no `description`**: Claude Code skips the file and writes the
>   reason to the debug log.
> - **YAML that doesn't parse**: Claude Code reads no fields from the file,
>   skips it, and writes the parse error to the debug log.

Those four are exactly `claude.agent.missing-frontmatter`,
`claude.agent.missing-name`, `claude.agent.missing-description`, and
`claude.agent.invalid-name`, so their error severity is a quoted load
failure. Plugin subagents without a `name` still load under their filename;
this scanner does not run `claude.agent.*` on plugin `agents/` directories.

## What is deliberately not checked

- **`name` against the filename.** Standing prohibition in `plans/003` and a
  regression test.
- **Model ids and tool names** (`agent.unknown-model`, `agent.unknown-tool`).
  Both need a hardcoded enumeration of valid values, which is the exact shape
  that shipped the 9-of-31 hook-event list.

## Staleness risk: LOW-MEDIUM

The two required fields are stable. The name rules changed between
2026-08-31 and 2026-11-13 (format line dropped, 256-character cap added).
