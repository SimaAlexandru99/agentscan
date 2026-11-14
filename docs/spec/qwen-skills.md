# Qwen Code skills

**Source:** https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/
**Also:** https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md
**Read:** 2026-11-14
**Depends on it:** (new) — proposed `qwen.skill.*` rules, or reuse of `agent-skills.skill.*` after a check of the name rule below

## Location

Quoted:

> Skills are stored as directories containing a `SKILL.md` file.

Quoted locations:

> Personal Skills are available across all your projects. Store them in `~/.qwen/skills/`:
>
> Project Skills are shared with your team. Store them in `.qwen/skills/` within your project:

Also read, per the docs:

- `~/.agents/skills/` (personal). Quoted: "Qwen Code also reads personal Skills from `~/.agents/skills/`."
- `.agents/skills/` (project). Quoted: "Qwen Code also reads project Skills from `.agents/skills/`."
- Custom directories from `skills.directories` (absolute or `~`-prefixed; relative paths resolve against the working directory, not the project root).

If two sources share a name, the `.qwen/skills/` copy wins over `.agents/skills/`
in the same tier. Quoted precedence: "project, then personal (including custom
directories), then extension, then bundled."

Symlinked skill folders are followed, and their target "can live anywhere on
disk".

## Required frontmatter

Quoted from "Field requirements":

> `name` is a non-empty string matching `/^[\p{L}\p{N}_:.-]+$/u` — Unicode letters
> and digits ..., plus `_`, `:`, `.`, `-`.

> `description` is a non-empty string

`priority` is optional. When present it must be a finite number.

Quoted template:

```
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---
```

Other documented frontmatter, all optional: `allowedTools` (read; an
`allowed-tools` field written for another agent "is ignored"), `paths` (gates
model discovery by file touched), `user-invocable: false`,
`disable-model-invocation`, and `hooks` (skill-scoped; see
[qwen-hooks.md](qwen-hooks.md)).

Extension skills are registered as `<extensionName>:<name>` at load time. The
file keeps the authored name. Personal, project and bundled skills keep their
own names.

## Gemini comparison

No Gemini skills capture exists in `docs/spec/` for this pass, so no
reuse claim is made here.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `<project>/.qwen/skills/<skill>/SKILL.md` | planned: yes |
| Project | `<project>/.agents/skills/<skill>/SKILL.md` | planned: yes |
| User | `~/.qwen/skills/<skill>/SKILL.md` | planned: yes, under `--global` |
| User | `~/.agents/skills/<skill>/SKILL.md` | planned: yes, under `--global` |
| Custom | directories in `skills.directories` | no, unless named by the user's config |
| Extension | `<ext>/skills/` | no |

## Unverified

- Whether the directory name must equal `name`. Cursor's rule is documented.
  Qwen's docs say only that `name` must be a non-empty string matching the regex.
  Do not port Cursor's name-vs-directory check.
- Whether `name` or `description` are required for skills that the docs label
  "Claude-compatible". The Claude-compat line is not in this capture.
- Whether `.qwen/skills/` entries that are not directories (for example a
  loose `SKILL.md` file at the top) are scanned. Only the directory form is
  documented.
- Required frontmatter for a subagent-style skill. Not covered here.

## Staleness risk: HIGH

Skill frontmatter fields are added often (`paths`, `priority`,
`user-invocable`, `disable-model-invocation`, `allowedTools` are all recent).
Re-read before adding any field-level check.
