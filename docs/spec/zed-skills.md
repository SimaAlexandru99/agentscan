# Zed skills

**Source:** https://zed.dev/docs/ai/skills
**Also:** https://github.com/zed-industries/zed/blob/main/docs/src/ai/skills.md (read 2026-11-14)
**Read:** 2026-11-14
**Depends on it:** (new)

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| Global | `~/.agents/skills/<name>/SKILL.md` | yes (planned) |
| Project-local | `<worktree>/.agents/skills/<name>/SKILL.md` | yes (planned), only in a trusted worktree |

Quoted table of skill roots: "Zed loads skills from two locations:" then the
two paths above.

## Layout

Quoted: "A skill is a named folder containing a `SKILL.md` file:"

> Each skill is a direct child of the skills root. Nesting skills inside subfolders is not supported.

Flat layout only. `~/.agents/skills/group/my-skill/` is not discovered. The
folder name should match the `name` field, but the page says "should", so this
is a convention, not a load rule.

## Frontmatter

`SKILL.md` starts with YAML frontmatter. Quoted table of fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Lowercase letters, numbers, and hyphens only. Max 64 characters. Should match the folder name. |
| `description` | Yes | What the skill does and when to use it. Keep it at most 1024 characters; skills with longer descriptions still load, but with a warning. |
| `disable-model-invocation` | No | Set to `true` to hide from the agent's catalog (invocable via slash command or @-mention only). |

Name validation, quoted: "Skills with invalid names fail to load and surface
an error in the UI." Rules: only `a-z`, digits and hyphens; not starting or
ending with a hyphen; no `--`; 1 to 64 characters.

## Limits

- Body of `SKILL.md`: "Keep the body of `SKILL.md` under 500 lines."
- Catalog budget: "The total size of all skill names and descriptions is capped at 50KB."
- Live reload: adding, removing or editing a `SKILL.md` takes effect without restart.

## Trust

Quoted: "Project-local skills only load from trusted worktrees." Skills from an
untrusted project are excluded from the catalog and slash commands. A project
skill with the same name as a global skill takes precedence.

## Scope of application

Quoted: "Zed Skills apply to the Zed Agent. External Agents and Terminal
Threads may have their own native skills, prompts, or instruction systems."

## Unverified

- Whether the agent may edit `SKILL.md` without authorization. The page says it cannot "without your explicit authorization"; the enforcement mechanism is not specified.
- Whether a `.agents/skills` directory is also read from `~/.claude/skills` or `.claude/skills`. Not documented for Zed.
- Whether frontmatter fields beyond `name`, `description`, `disable-model-invocation` are ignored or rejected. The page says more fields are planned, not what happens to unknown keys.

## Staleness risk: HIGH
