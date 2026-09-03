# Agent Skills — portable SKILL.md contract

**Source:** https://agentskills.io/specification
**Also:** https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py (reference validator)
**Read:** 2026-09-03
**Depends on it:** `agent-skills.skill.missing-frontmatter`, `agent-skills.skill.missing-name`,
`agent-skills.skill.missing-description`, `agent-skills.skill.invalid-name`,
`agent-skills.skill.name-does-not-match-directory`, `agent-skills.skill.name-too-long`,
`agent-skills.skill.description-too-long`, `agent-skills.skill.invalid-compatibility`,
`agent-skills.skill.invalid-metadata`, `agent-skills.skill.invalid-allowed-tools`,
`agent-skills.skill.body-too-large`, `skill.missing-skill-md`, `skill.broken-reference`

This is **not** the Claude Code skills page. Claude native `name` is optional and
defaults to the directory; see [skills.md](skills.md). Applying this file's
required-name rules to `.claude/skills` is a false positive. Cursor
`.cursor/skills` uses this contract; see [cursor-skills.md](cursor-skills.md).
Codex `.codex/skills` (project-local and `~/.codex/skills`) uses this contract
too; see [codex-skills.md](codex-skills.md).

## Directory structure

A skill is a directory containing, at minimum, a `SKILL.md` file.

## Frontmatter

`SKILL.md` must contain YAML frontmatter followed by Markdown content.

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | **Yes** | Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen. Must not contain consecutive hyphens. **Must match the parent directory name.** |
| `description` | **Yes** | Max 1024 characters. Non-empty. |
| `license` | No | License name or bundled license file. |
| `compatibility` | No | **1–500 characters** when present. |
| `metadata` | No | `map<string, string>` when present. |
| `allowed-tools` | No | **string** (space-separated tools) when present. Experimental. |

Quoted name rules:

> Must be 1-64 characters. May only contain unicode lowercase alphanumeric
> characters (`a-z`, `0-9`) and hyphens (`-`). Must not start or end with a
> hyphen. Must not contain consecutive hyphens. Must match the parent
> directory name.

### "unicode lowercase alphanumeric" is wider than `[a-z0-9]`

The reference validator that the spec page points at (`skills-ref validate`)
implements the name rule as (read 2026-09-02):

> Skill names support i18n characters (Unicode letters) plus hyphens. Names
> must be lowercase and cannot start/end with hyphens.

and checks `c.isalnum() or c == "-"` for every character plus
`name == name.lower()`. So `résumé-builder` and `日本語` are valid names, and
`Résumé` is not. `agent-skills.skill.invalid-name` uses the same rule:
`^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$` with the name equal to its own lowercase
form. Before 2026-09-02 the check used an ASCII-only regex and reported a
lowercase accented name at severity error.

The validator also NFKC-normalises before comparing `name` to the directory.
This scanner compares the raw strings; a mismatch that exists only between
Unicode normalisation forms is not reported either way.

Quoted optional fields (2026-08-31):

> `compatibility` — Must be 1-500 characters if provided.
> `metadata` — A map from string keys to string values.
> `allowed-tools` — A space-separated string of tools that are pre-approved to run.

When an optional field is absent, do not invent a requirement. When it is
present and off-contract, emit the matching `agent-skills.skill.invalid-*` check.

## Recommendations

Quoted:

> Keep your main `SKILL.md` under 500 lines.

`agent-skills.skill.body-too-large` reports this at **info**
(vendor-recommendation). It is not a load failure.

Quoted:

> Keep file references one level deep from `SKILL.md`.

That depth recommendation is not shipped as an error.

## File references

Quoted:

> When referencing other files in your skill, use relative paths from the skill
> root.

Agent Skills broken-reference checks resolve **only** against the skill
directory. Repo-root fallback is Claude-native empirical behaviour and must
not apply here.

## Staleness risk: MEDIUM

Required fields and name syntax are the load-bearing contract. Re-read when
adding checks or when a user reports a valid portable skill as broken.
