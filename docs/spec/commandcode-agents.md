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
| Project | `.commandcode/agents/*.md` |
| Personal | `~/.commandcode/agents/*.md` (`--global`) |

They load bundled → personal → project; first definition of a name wins.
agentscan inventories each readable file.

## Name

Quoted table: `name` is required, default **filename**. Do not invent a
missing-name error until that fallback is applied. Only these keys are read;
anything else is ignored.

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
| `reasoningEffort` | string | no | model-specific; unknown levels are dropped at load with a warning. No closed list on this page — do not invent one |
| `maxTurns` | integer | no | default 100 |
| `permissionMode` | string | no | `default`, `auto-accept`, `bypass`, `plan`, `dont-ask` |
| `background` | boolean | no | |
| `showOutput` | boolean | no | |

Validate documented types and the `permissionMode` enum. Do not invent
unknown-model or unknown-tool checks (same failure class as the 9-of-31 hook
list).

## Staleness risk: HIGH
