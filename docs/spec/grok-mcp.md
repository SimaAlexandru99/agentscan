# Grok Build MCP (config.toml)

**Source:** https://docs.x.ai/build/features/mcp-servers
**Read:** 2026-08-31
**Depends on it:** `grok.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

Also consulted: https://docs.x.ai/build/settings (user vs project vs managed
scopes; `$GROK_HOME`).

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `.grok/config.toml` walked from cwd to the git / scan boundary | yes |
| User | `$GROK_HOME/config.toml`, or `~/.grok/config.toml` when unset | `--global` only |
| Managed | `~/.grok/managed_config.toml`, `/etc/grok/managed_config.toml` | unread |
| Requirements | `~/.grok/requirements.toml`, `/etc/grok/requirements.toml` | unread |
| Credentials | `~/.grok/mcp_credentials.json`, `~/.grok/auth.json` | never |

Settings page: project configs are limited to MCP servers, plugins, and
permission rules. This scanner reads only `[mcp_servers]`. Plugins,
permissions, managed layers, `GROK_CONFIG` / `GROK_CONFIG_PATH`, and
credential files are out of scope.

## Shape

Each server is a `[mcp_servers.<name>]` table.

Quoted official example (stdio):

```toml
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
env = { API_KEY = "${MY_API_KEY}" }
startup_timeout_sec = 30
tool_timeout_sec = 6000
```

Quoted official example (HTTP):

```toml
[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"
headers = { "x-mcp-session-id" = "{{session_id}}" }
```

STDIO: `command` (required for that launch). Streamable HTTP: `url`. No
`type` field is required. Official remote examples set `url` alone.

Applying Claude's `url`-without-`type` rule to Grok is a false positive.

Grok expands `${VAR}` and `${VAR:-default}` in `url`, `command`, `args`,
`env`, and `headers`. Interpolated commands are not path-checked.

Other keys in `config.toml` are not MCP servers and must be ignored.

## Precedence

Quoted from the MCP page:

> When loading, Grok walks from the current directory up to the git root
> reading each `.grok/config.toml`, and a project server with the same name
> as a user one replaces it entirely.

Closer project file wins over a parent project file. Any project file beats
the user file. Spec/runtime `grok.mcp.*` checks skip
`grokEffective === false`. Security checks still inspect every readable MCP
file.

## Compatibility (unread)

The MCP page also loads `~/.claude.json`, `.cursor/mcp.json`, and project
`.mcp.json`, merged below `config.toml`. Those files keep their own provider
schemas. This scanner does not add `consumedBy: grok` to them.

## Staleness risk: HIGH
