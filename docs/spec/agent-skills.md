# Agent Skills — portable SKILL.md contract

**Source:** https://agentskills.io/specification
**Read:** 2026-08-30
**Depends on it:** `agent-skills.skill.missing-frontmatter`, `agent-skills.skill.missing-name`, `agent-skills.skill.missing-description`, `agent-skills.skill.invalid-name`, `agent-skills.skill.name-does-not-match-directory`, `agent-skills.skill.name-too-long`, `agent-skills.skill.description-too-long`, `skill.missing-skill-md`, `skill.broken-reference`

This is **not** the Claude Code skills page. Claude native `name` is optional and
defaults to the directory; see [skills.md](skills.md). Applying this file's
required-name rules to `.claude/skills` is a false positive.

## Directory structure

A skill is a directory containing, at minimum, a `SKILL.md` file.

## Frontmatter

`SKILL.md` must contain YAML frontmatter followed by Markdown content.

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | **Yes** | Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen. Must not contain consecutive hyphens. **Must match the parent directory name.** |
| `description` | **Yes** | Max 1024 characters. Non-empty. |

Quoted name rules:

> Must be 1-64 characters. May only contain unicode lowercase alphanumeric
> characters (`a-z`, `0-9`) and hyphens (`-`). Must not start or end with a
> hyphen. Must not contain consecutive hyphens. Must match the parent
> directory name.

Quoted description rules:

> Must be 1-1024 characters.

## Recommendations (not shipped as errors)

> Keep your main `SKILL.md` under 500 lines.

> Keep file references one level deep from `SKILL.md`.

These are recommendations. 0.8.0 does not emit `skill.body-too-large` or
`skill.reference-too-deep`.

## Staleness risk: MEDIUM

Required fields and name syntax are the load-bearing contract. Re-read when
adding checks or when a user reports a valid portable skill as broken.
