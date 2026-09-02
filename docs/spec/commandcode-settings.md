# Command Code settings

**Source:** https://commandcode.ai/docs/settings
**Read:** 2026-09-02
**Depends on it:** discovery of hooks, inline MCP, extra skill directories; model-settings precedence. No model-id enumeration.

## Files

Command Code **project root** is the git root when that git directory is
inside the scan, or the working directory outside a git repo (or when a
`.agentscan-root` pin stops the walk before a parent checkout). It is
**not** agentscan's generic nearest-provider `projectRoot`. A child
`.cursor` / `.claude` / `.agents` directory must not hide:

```
<git-root>/.commandcode/settings.json
<git-root>/.commandcode/settings.local.json
```

```
USER ~/.commandcode/
├── settings.json
├── mcp.json
├── auth.json          ← never read
└── projects/{project}/mcp.json   ← only with an honest slug

PROJECT <commandcodeProjectRoot>/
├── .commandcode/settings.json
├── .commandcode/settings.local.json
└── .mcp.json
```

Quoted: "Never commit `~/.commandcode` files. They're user-level by design;
`auth.json` holds credentials."

`COMMANDCODE_PROJECT_DIR` / `COMMANDCODE_CWD`, extra skill directories, inline
MCP command paths, hooks path bases, and the winning `model` all resolve
against this Command Code project root.

## Settings layers (high → low)

1. `<project>/.commandcode/settings.local.json`
2. `<project>/.commandcode/settings.json`
3. `~/.commandcode/settings.json` (`--global`)
4. `~/.commandcode/config.json` (legacy overlapping keys only) — not scanned
   for hooks / MCP / skills

Maps deep-merge; scalars overwrite. Exception: permission rule lists union.
The `skills` array is **replaced whole** by the highest layer that defines it
(see [commandcode-skills.md](commandcode-skills.md)).

## Model for a session (settings files only)

`--model` and in-session `/model` are runtime and are not on disk. Of the
files this scanner reads:

1. `model` in `settings.local.json`
2. `model` in project `settings.json`
3. `model` in user `settings.json`

Do not validate model ids. The page does not publish a closed list.

## Inline MCP

Top-level `mcp` is `{ "servers": [ … ] }`. Entry schema is the same transport
schema as [commandcode-mcp.md](commandcode-mcp.md). If an array item has no
honest name, inventory it without inventing a name-keyed launch error.

## Mods

`mods` is `{ sources?, paths?, disabled? }`. Coverage is experimental /
inventory-only. Never execute or import TypeScript mods.

## Staleness risk: HIGH
