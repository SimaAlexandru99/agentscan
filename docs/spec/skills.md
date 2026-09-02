# Skills — SKILL.md frontmatter

**Source:** https://code.claude.com/docs/en/skills
**Read:** 2026-09-02
**Depends on it:** `claude.skill.missing-frontmatter`, `claude.skill.missing-description`,
`skill.description-budget`

## Structure

> Every skill needs a `SKILL.md` file with two parts: YAML frontmatter between
> `---` markers that tells Claude when to use the skill, and markdown content
> with the instructions Claude follows when the skill runs. **The directory name
> becomes the command you type**, and the `description` helps Claude decide when
> to load the skill automatically.

`SKILL.md` is required in a skill directory. Other files are optional:
templates, example outputs, scripts, reference documentation.

## Frontmatter fields

Quoted (2026-08-31): all fields are optional. Only `description` is recommended.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | **No** | Display name. Defaults to the directory name. |
| `description` | **Recommended** | What the skill does and when to use it. **If omitted, uses the first paragraph of markdown content.** Combined `description` and `when_to_use` is truncated at 1,536 characters in the skill listing. |
| `when_to_use` | No | Appended to `description` in the listing; counts toward the 1,536-character cap. |

`claude.skill.missing-description` fires only when frontmatter has no
`description` **and** there is no first markdown paragraph.

## Listing budget (not 16,000 bytes)

Quoted:

> The budget scales at 1% of the model's context window. […] To raise the
> budget, set the `skillListingBudgetFraction` setting […] or the
> `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable to a fixed character
> count. […] each entry's combined text is capped at 1,536 characters
> regardless of budget. The cap is configurable with `skillListingMaxDescChars`.

agentscan cannot read the model's context window. The configurable fallback is
`thresholds.skillListingChars` (default **8000 characters**). Per-entry cap is
`thresholds.skillListingMaxDescChars` (default **1536**). Listing text is
`description` (or the first markdown paragraph) plus `when_to_use`.
`thresholds.skillDescriptionBytes` is accepted for one release as an alias of
`skillListingChars` — do not treat 16000 bytes as the runtime budget.

This is **not** applied to Agent Skills schema profiles. See
[thresholds.md](thresholds.md).

## Where the command name comes from

| Location | Command name from |
|----------|-------------------|
| `.claude/skills/<dir>/SKILL.md` | **the directory name** |
| Nested `.claude/skills/`, on a clash | subdirectory path, then the directory name |
| Plugin `skills/<dir>/SKILL.md` | frontmatter `name` **or** the directory name, namespaced by plugin |
| Plugin root `SKILL.md` | frontmatter `name`, falling back to the plugin directory name |

## Two checks this killed

`skill.name-mismatch` enforced "frontmatter `name` must equal the directory
name". The spec says the opposite: `name` is optional, it is a *display* name,
and it defaults to the directory. For a non-plugin skill the command comes from
the directory regardless, so a difference is by design. **24 of 37 findings
across 17 projects, every one false.**

`skill.missing-name` enforced an optional field.

## The same trap, avoided once

Agent definitions under `.claude/agents/` were measured before a matching check
was written: 16 of 34 real files have a frontmatter `name` that differs from the
filename (`engineering-api-platform-engineer.md` declares
`name: API Platform Engineer`). The check was refused on that evidence. The
identical evidence sat in front of skills and the check shipped anyway — see
`plans/003` for the standing prohibition.

## File references

Claude native skills still try the skill directory first, then the repo root
(empirical two-base rule). Agent Skills references resolve from the skill root
only; see [agent-skills.md](agent-skills.md).
