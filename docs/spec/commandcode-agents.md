# Command Code custom agents

**Source:** https://commandcode.ai/docs/agents
**Read:** 2026-08-31
**Depends on it:** `commandcode.agent.reserved-name`,
`commandcode.agent.invalid-permission-mode`,
`commandcode.agent.invalid-field-type`

Do not emit `claude.agent.*` on these files.

## Locations

| Source | Path |
|--------|------|
| Project | `<project>/.commandcode/agents/*.md` at the Command Code project root only |
| Personal | `~/.commandcode/agents/*.md` (`--global`) |

They load bundled → personal → project; first definition of a name wins.
Personal therefore shadows project on a name collision. Nested package
`.commandcode/agents` is not Command Code project config. agentscan
inventories each readable file and sets `commandcodeEffective`. Spec/runtime
`commandcode.agent.*` checks skip shadowed files.

## Name

Quoted table: `name` is required, default **filename**. Do not invent a
missing-name error until that fallback is applied. Only these keys are read;
anything else is ignored. Unknown frontmatter keys are not type-checked.
`reasoningEffort` is settings/model configuration, not a documented
custom-agent field — do not invent a type rule for it.

Sanitized to `a-z A-Z 0-9 _ -`. Sanitised names still load — do not treat
Claude's lowercase-hyphen identifier rule as a Command Code load failure.

Reserved names: `explore`, `plan`, `review`, `general`. Quoted:

> A custom file with one of these names is ignored.

## Fields (types and enums only)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes (filename fallback) | |
| `description` | string | no | default `""` — do not emit missing-description |
| `tools` | string or string[] | no | `"*"` or a list; do not enumerate tool ids |
| `disallowedTools` | string or string[] | no | same format |
| `model` | string | no | any `/model` id — **do not enumerate** |
| `maxTurns` | positive integer | no | default 100; `0` and `-1` are invalid |
| `permissionMode` | string | no | `default`, `auto-accept`, `bypass`, `plan`, `dont-ask` |
| `background` | boolean | no | |
| `showOutput` | boolean | no | |

Validate documented types and the `permissionMode` enum. Do not invent
unknown-model or unknown-tool checks (same failure class as the 9-of-31 hook
list). Do not enumerate model ids. Do not invent a type rule for unknown
agent frontmatter keys.

`commandcode.agent.invalid-field-type` covers every documented typed field
when the value is present and the type is wrong. Filename fallback for a
missing `name` remains valid; a non-string `name` is a type error.

## Staleness risk: HIGH
