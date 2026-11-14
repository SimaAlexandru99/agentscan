# Amp MCP

**Source:** https://ampcode.com/docs/customize/mcp
**Also:** https://ampcode.com/docs/cli/settings (settings file locations, `amp.mcpServers` key)
**Read:** 2026-11-14
**Depends on it:** (new)

## Config files

Quoted, settings locations (https://ampcode.com/docs/cli/settings):

> User settings: macOS: ~/.config/amp/settings.json or ~/.config/amp/settings.jsonc
> Linux: ~/.config/amp/settings.json or ~/.config/amp/settings.jsonc
> Windows: %USERPROFILE%\.config\amp\settings.json or %USERPROFILE%\.config\amp\settings.jsonc
>
> Workspace settings: the nearest .amp/settings.json or .amp/settings.jsonc, searched upward
> from your current working directory to the repository root, or the current directory outside a
> Git repository

Quoted, the key (MCP page):

> Local MCP configuration is stored in amp.mcpServers.

> In configuration files, set amp.mcpServers and use ${VAR_NAME} syntax for environment variables

The key is `amp.mcpServers`, an object keyed by server name. Settings keys use
the `amp.` prefix; the file is JSON (or JSONC).

## Entry fields

Quoted: "MCP servers use the same configuration fields as MCP servers in skills
-- command/args/env for local servers, url/headers for remote."

- Local (stdio): `command` (string), `args` (string array), `env` (object).
- Remote: `url` (string), `headers` (object).
- No `type` field is documented. Transport is inferred from `command` vs `url`.
- Official example, verbatim shape:

```json
"amp.mcpServers": {
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest", "--headless"] },
    "linear": { "url": "https://mcp.linear.app/sse" },
    "sourcegraph": {
        "url": "${SRC_ENDPOINT}/.api/mcp/v1",
        "headers": { "Authorization": "token ${SRC_ACCESS_TOKEN}" }
    }
}
```

`${VAR_NAME}` is the documented env reference in config files. A `url` entry is
local configuration even when it points at another machine.

## Trust and precedence

> MCP servers in workspace settings (.amp/settings.json) require explicit approval before they can
> run.

> MCP servers in your global settings (~/.config/amp/settings.json) or passed via --mcp-config do
> not require approval.

Precedence, highest first: CLI flag `--mcp-config`; workspace
`amp.mcpServers` in `.amp/settings.json`; user `amp.mcpServers` in
`~/.config/amp/settings.json`; skill-provided servers. Same name at a higher
level overrides a lower one.

## Remote MCP definitions (not file-based)

Quoted: "Remote MCP definitions are stored by ampcode.com." They are set with
`amp mcp remote` and the web settings, not in any settings file. An offline
linter cannot see them.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| User | `~/.config/amp/settings.json` (or `.jsonc`); Windows `%USERPROFILE%\.config\amp\settings.json` | planned, key `amp.mcpServers` |
| Workspace | nearest `.amp/settings.json` (or `.jsonc`) searched upward from cwd to repo root | planned, key `amp.mcpServers` |
| Skill | sibling `mcp.json` or `mcpServers` in `SKILL.md` frontmatter (see `amp-skills.md`) | planned, see skills file |
| Remote | ampcode.com-stored definitions | no, not in any file |

## Staleness risk: HIGH

Amp's docs move quickly and the page states that remote definitions are
managed outside files. Re-read before a rule ships.

## Unverified

- Whether `includeTools` (documented for skill `mcp.json`) is accepted inside `amp.mcpServers` entries.
- Whether `env` is accepted on remote (`url`) entries. Documented only for local servers.
- Whether `amp.mcpServers` may appear in `.amp/settings.jsonc` with the same semantics (listed as a valid file, no separate statement).
- Required-field rules: the docs show `command` or `url` in every example; no validation statement exists.
- Hooks and subagents: not MCP surfaces. The plugin page documents event handlers (e.g. `agent.end`), not a hook config file. Not written as a spec file.
