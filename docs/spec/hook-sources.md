# Where a hook can be registered

**Sources:** https://code.claude.com/docs/en/hooks ·
https://code.claude.com/docs/en/plugins ·
https://code.visualstudio.com/docs/agent-customization/hooks ·
https://docs.github.com/en/copilot/reference/hooks-reference
**Read:** 2026-09-02 (seven locations unchanged)
**Depends on it:** `hook.missing-script` and `hook.unknown-event` for every
source below (`src/discover/hooks.ts`)

[hook-events.md](hook-events.md) covers *which event names* are dispatched. This
file covers *which files* a hook can be declared in, because a scanner that
reads one of them and claims to check hooks is wrong about the other six.

## The seven locations

Quoted:

> Where you define a hook determines its scope:
> - `~/.claude/settings.json` - All your projects
> - `.claude/settings.json` - Single project
> - `.claude/settings.local.json` - Single project
> - Managed policy settings - Organization-wide
> - Plugin `hooks/hooks.json` - When plugin is enabled
> - Skill frontmatter - The rest of the session once the skill is invoked
> - Subagent frontmatter - While that subagent is running

agentscan reads the two project settings files, in-tree plugin
`hooks/hooks.json`, skill / subagent / command-file frontmatter, and
in-tree plugin `skills/` plus plugin-root `SKILL.md`. Under `--global` /
`includeGlobal` it also reads `$CLAUDE_CONFIG_DIR/settings.json` or
`~/.claude/settings.json` (same Claude schema; `${CLAUDE_PROJECT_DIR}`
resolves against the scanned project). Managed policy and marketplace
plugins stay unread — see *Deliberately unread* below.

## Plugin `hooks/hooks.json`

> Define plugin hooks in `hooks/hooks.json` with an optional top-level
> `description` field. When a plugin is enabled, its hooks merge with your user
> and project hooks.

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh", "args": [], "timeout": 30 }
        ]
      }
    ]
  }
}
```

The `hooks` object is the same shape as the one in a settings file, so the same
parser reads both. `description`, `args` and `timeout` are extra keys this tool
ignores rather than rejects.

### Where the file sits

Quoted, from the plugins reference:

> **Common mistake**: Don't put `commands/`, `agents/`, `skills/`, or `hooks/`
> inside the `.claude-plugin/` directory. Only `plugin.json` goes inside
> `.claude-plugin/`. All other directories must be at the plugin root level.
>
> The plugin root is the individual plugin's own directory: the one you pass to
> `--plugin-dir` or that contains `.claude-plugin/plugin.json`.

So a plugin root inside a scanned tree is identified by
`.claude-plugin/plugin.json`, and its hooks live at `<plugin root>/hooks/hooks.json`.

## Skill and subagent frontmatter

> In addition to settings files and plugins, hooks can be defined directly in
> skills and subagents using frontmatter, in the same configuration format as
> settings-based hooks.

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

Identical structure for a subagent file. The YAML mapping is the JSON object
from a settings file, so `collectHookCommands` reads it unchanged.

## Path placeholders

> Use these placeholders to reference hook scripts relative to the project or
> plugin root, regardless of the working directory when the hook runs:
> * `${CLAUDE_PLUGIN_ROOT}`: the plugin's installation directory, for scripts
>   bundled with a plugin. **Changes on each plugin update.**

`${CLAUDE_PLUGIN_ROOT}` has a defined value only for a hook that came from a
plugin. In a settings file there is no plugin and therefore no base, so the
resolver must keep refusing it there — expanding it against the project root
would be an invented answer, the same class of guess the parser refuses for
every other environment variable.

The docs name `${CLAUDE_PROJECT_DIR}` alongside it; that one is already handled
and means the project root in every source.

A third placeholder appears as of 2026-09-02: `${CLAUDE_PLUGIN_DATA}`, "the
plugin's persistent data directory, for dependencies and state that should
survive plugin updates." It names a per-machine directory this scanner cannot
locate, so a command under it is skipped (never reported missing), the same as
any other unresolved variable.

**A bare relative path has no stated base.** The placeholders exist precisely
because the working directory is not guaranteed, so `./scripts/security-check.sh`
in a skill's frontmatter is not resolvable with certainty. This tool resolves it
against the skill or agent's own directory and against the project root, and
reports only when it is missing from both — the same two-base rule
`skill.broken-reference` uses. That rule is a judgement, not a quoted line: see
*Confidence* below.

## Measured, 2026-08-24

Against 17 real `hooks/hooks.json` files installed under `~/.claude/plugins`:

| Measurement | Result |
|---|---|
| Parse as JSON | 17 of 17 |
| Top-level shape | `hooks` in 17; 10 also carry `description` |
| Command strings | 33 |
| Using `${CLAUDE_PLUGIN_ROOT}` | 31 |
| Using `CLAUDE_PROJECT_DIR` | 0 |
| Resolvable path occurrences | 40 |
| Missing on disk | 0 |
| Entries carrying `args` | 0 |

Against 798 `SKILL.md` and `.claude/agents/*.md` files: **0** declare
frontmatter `hooks:`.

Both new surfaces are documented and currently unused in that corpus. That is
the same position `mcp.url-without-type` shipped in — it exists because the
failure is silent at scan time, not because it is common. Zero findings here is
not evidence the checks are worthless.

## `--global` user settings

`~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`) is
opened only with `--global` / `includeGlobal`, the same scoping as
user skills, agents, memory, rules, and commands. Same-event hooks from
user and project settings coexist — the page lists every location as a
place a hook can be defined and does not say one replaces the other.

## Deliberately unread

- Managed policy settings — organization-wide, not the project's to fix.
- Installed marketplace plugins under `~/.claude/plugins` — outside the project,
  and the docs say the install directory "changes on each plugin update".
  Measured above: 17 plugins, 0 broken paths.

## Confidence

**High** for the file locations and the three shapes: each is quoted above and
the plugin shape is corroborated by 17 real files.

**Medium** for the two-base rule on bare relative paths in frontmatter hooks.
No published line states the base, and the measured corpus is empty, so nothing
tests it. The finding's `reason` names both bases it tried. If a user reports a
false positive here, narrow the rule to absolute and `${CLAUDE_PROJECT_DIR}`
paths rather than defending it — see the STOP condition in
`plans/020-hooks-outside-settings.md`.

## Staleness risk: MEDIUM

The seven-location list grew to include skills and subagents; it can grow again.
The failure mode is silence — a new location this tool does not read — which is
less damaging than a false positive but is exactly the gap this file exists to
close. Re-read the hooks reference at release time.

## VS Code and Copilot CLI

Workspace `.github/hooks/*.json` is always scanned. Native VS Code files have
no `version` and are command-only ([vscode-hooks.md](vscode-hooks.md)).
Copilot CLI files declare `version: 1` ([copilot-hooks.md](copilot-hooks.md)).
Inline Copilot `hooks` in `.github/copilot/settings.json` and
`.github/copilot/settings.local.json` are scanned as `copilot-settings`
(always `copilot-cli`). User `~/.copilot/hooks` and
`~/.copilot/settings.json` (or `$COPILOT_HOME/…`) are scanned only under
`--global`. `/etc/github-copilot/policy.d` is unread. `.claude/settings.json`
stays Claude.

