# Skills — SKILL.md frontmatter

**Source:** https://code.claude.com/docs/en/skills
**Read:** 2026-08-09
**Depends on it:** `skill.missing-frontmatter`, `skill.missing-description`

## Structure

> Every skill needs a `SKILL.md` file with two parts: YAML frontmatter between
> `---` markers that tells Claude when to use the skill, and markdown content
> with the instructions Claude follows when the skill runs. **The directory name
> becomes the command you type**, and the `description` helps Claude decide when
> to load the skill automatically.

`SKILL.md` is required in a skill directory. Other files are optional:
templates, example outputs, scripts, reference documentation.

## Frontmatter fields

| Field | Required | Notes |
|-------|----------|-------|
| `name` | **No** | "Display name shown in skill listings. **Defaults to the directory name.**" |
| `description` | **Recommended** | "What the skill does and when to use it. Claude uses this to decide when to apply it." |
| `when_to_use` | No | |

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

`skill.missing-description` survives at **info**, not warning: "Recommended" is
not "required", and a skill without one still works when invoked directly — it
just will not be picked up automatically.

## The same trap, avoided once

Agent definitions under `.claude/agents/` were measured before a matching check
was written: 16 of 34 real files have a frontmatter `name` that differs from
the filename (`engineering-api-platform-engineer.md` declares
`name: API Platform Engineer`). The check was refused on that evidence. The
identical evidence sat in front of skills and the check shipped anyway — see
`plans/003` for the standing prohibition.
