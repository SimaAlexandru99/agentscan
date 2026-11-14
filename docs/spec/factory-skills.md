# Factory Droid skills

**Source:** https://docs.factory.com/harness/skills (same text at https://docs.factory.com/cli/configuration/skills)
**Read:** 2026-11-14
**Depends on it:** (new)

Quoted:

> A skill is a directory that contains a `SKILL.md` entry point, optional supporting files, and frontmatter that tells Droid when the workflow applies.

> Droid searches skill folders recursively. The first directory that contains `SKILL.md` is treated as a skill directory.

> The skill entry point must be named `SKILL.md`. Do not use `skill.mdx` for Droid skills.

Required frontmatter (table): `name` (Yes; "Skill identifier. Use lowercase letters, numbers, and hyphens.") and `description` (Yes; "Short routing description."). Every other field is optional: `allowed-tools`, `enabled` (default `true`), `user-invocable` (default `true`), `disable-model-invocation` (default `false`), `license`, `compatibility`, `metadata`, `version`.

> Older skill files may contain a `tools` field. Treat `tools` as deprecated legacy metadata and use `allowed-tools` instead.

> `allowed-tools` records the tools the skill is designed to use. ... it does not add tools or sandbox standard skill invocation.

Scope locations (table): Project `<repo>/.factory/skills/<skill-name>/SKILL.md`; Folder-specific `<repo>/<project-area>/.factory/skills/<skill-name>/SKILL.md`; Personal `~/.factory/skills/<skill-name>/SKILL.md`; Compatibility `<repo>/.agents/skills/**/SKILL.md` and `<repo>/.agent/skills/**/SKILL.md`; Personal compatibility `~/.agents/skills/**/SKILL.md` and `~/.agent/skills/**/SKILL.md`; plus Mission, Automation, Plugin and Built-in sources.

Precedence (outside mission and automation): folder-specific and project skills, then project plugin skills, then personal skills, then user plugin skills, then built-in.

> If two skills in the same source share a name, Droid ignores one of them and `/diagnostics` reports the ignored copy.

Disable list: `disabledSkills` (array of skill names) in `~/.factory/settings.json` or `<project>/.factory/settings.json`.

Supporting files: "Supporting files are not loaded automatically."

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| Project | `.factory/skills/<name>/SKILL.md` | yes |
| Project compatibility | `.agents/skills/**/SKILL.md`, `.agent/skills/**/SKILL.md` | yes |
| Personal | `~/.factory/skills/<name>/SKILL.md` | `--global` only |
| Personal compatibility | `~/.agents/skills/**/SKILL.md`, `~/.agent/skills/**/SKILL.md` | `--global` only |

## Unverified

- Whether `name` must equal the parent directory name. Not stated.
- Whether `name` has a regex beyond "lowercase letters, numbers, and hyphens". Not stated.
- Whether `.claude/skills/` or `.codex/skills/` are loaded. Not in the scope table.
- Whether the `disabledSkills` settings path is the only way to disable a skill besides `enabled: false`. The page says "a settings ledger" but does not name other keys.

## Staleness risk: HIGH
