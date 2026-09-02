# Grok Build skills

**Source:** https://docs.x.ai/build/features/skills-plugins-marketplaces
**Read:** 2026-09-02
**Depends on it:** `grok.skill.missing-frontmatter`, `skill.missing-skill-md`,
`skill.broken-reference`

Do not apply the portable Agent Skills required-`name` / directory-match
contract, and do not apply Claude listing-budget checks, to `.grok/skills`.
Compatibility reads of Claude / Cursor / `~/.agents/skills` stay on those
providers.

## Locations

Quoted discovery list:

- `./.grok/skills/` (walked up to the repo root)
- `~/.grok/skills/`
- Any enabled plugin's `skills/` directory — unread (plugins are out of scope)
- Extra paths under `[skills] paths` in `~/.grok/config.toml`

`[skills] paths` / `ignore` / `disabled` do not quote a resolution base
(relative to `$GROK_HOME`, cwd, or something else). Extra paths are unread
until that is published. User `~/.grok/skills` (or `$GROK_HOME/skills`) is
opened only under `--global`.

## Frontmatter

Quoted:

> `SKILL.md` starts with YAML frontmatter. Extra keys are ignored.

A readable `SKILL.md` with no `---` block is `grok.skill.missing-frontmatter`.

Quoted field table (not the Agent Skills spec):

| Field | Official note |
|-------|----------------|
| `name` | Identifier. Directory name if omitted. |
| `description` | What it does and when to use it. First body paragraph if omitted. |
| `when-to-use` | Extra trigger phrases. Alias: `when_to_use`. |
| `allowed-tools` | Does not grant or restrict tools. Accepts a YAML list or a comma/space-separated string. |
| `metadata` | String map. |
| `user-invocable` | Default `true`. Only the literal `true` counts. |

`name` and `description` are optional (directory / first paragraph fallback).
Do not emit `grok.skill.missing-name` or `grok.skill.missing-description`.
Do not require `name` to match the directory.

Quoted:

> Grok accepts `model`, `effort`, `license`, and `compatibility` and does
> not apply them.

Those keys must not become required-field or format checks.

`allowed-tools` accepts a YAML list or a string. Applying
`agent-skills.skill.invalid-allowed-tools` (string only) is a false positive.

## Staleness risk: HIGH
