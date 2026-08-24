# Agent definitions — frontmatter

**Source:** https://code.claude.com/docs/en/sub-agents
**Read:** 2026-08-24
**Depends on it:** `agent.missing-frontmatter`, `agent.missing-description`,
`agent.missing-name`, `agent.invalid-name`, `agent.duplicate-name`
(`src/checks/agents.ts`)

## Frontmatter fields

| Field | Required | Quoted |
|-------|----------|--------|
| `name` | **Yes** | "Unique identifier using lowercase letters and hyphens." |
| `description` | **Yes** | "When Claude should delegate to this subagent" |

Both are required, which is why `agent.missing-name` and
`agent.missing-description` exist here while the equivalent skill checks do not —
for a skill, every frontmatter field is optional and `name` defaults to the
directory. See [skills.md](skills.md).

## The one documented load failure

> Names can't contain `:`, which is reserved for plugin-scoped identifiers such
> as `my-plugin:reviewer`. Claude Code doesn't load a file whose name contains
> one and logs an error to the debug log.

That is the only sentence on the page that says a badly shaped name stops the
file loading. The lowercase-and-hyphens line states the format; it does not
state what happens when a name departs from it.

## Why `agent.invalid-name` is a warning

Severity `error` in this tool means *something configured here does not work*.
The docs support that claim for `:` and do not make it for `name: SEO
Specialist`, which is common in real files — measured at 16 of 34 across real
projects. The check stays, because the reference does specify the format, but it
reports at `warning`.

If upstream ever documents that off-format names are not loaded, this becomes an
error and this file records the sentence that changed it.

## What is deliberately not checked

- **`name` against the filename.** Nothing keys on the filename;
  `engineering-api-platform-engineer.md` declaring `name: API Platform Engineer`
  is by design. `plans/003` carries the standing prohibition and a regression
  test.
- **Model ids and tool names** (`agent.unknown-model`, `agent.unknown-tool`).
  Both need a hardcoded enumeration of valid values, which is the exact shape
  that shipped the 9-of-31 hook-event list. Cut until a complete published
  enumeration can be cited — see [hook-events.md](hook-events.md).

## Staleness risk: LOW-MEDIUM

The two required fields are stable. The thing most likely to change is the
enforcement of the name format, which is what the severity choice above hangs
on.
