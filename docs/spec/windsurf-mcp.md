# Windsurf / Cascade MCP (`mcp_config.json`)

**Source:** https://docs.windsurf.com/windsurf/cascade/mcp
**Read:** 2026-08-31
**Depends on it:** `windsurf.mcp.no-launch`, `mcp.command-missing`,
`security.hardcoded-secret`, `mcp.literal-env`

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| User (Cascade) | `~/.codeium/windsurf/mcp_config.json` | `--global` only |
| Project | none quoted | not invented |
| Devin Local | “Devin CLI config files” (no published path) | unread |
| Marketplace / admin allowlists / OAuth stores | not project files | unread |

Quoted (read 2026-08-31):

> The MCP configuration on this page applies to the legacy Cascade agent
> only. The Devin Local agent — the default agent for new tabs — configures
> MCP servers in the Devin CLI config files instead.

> The `~/.codeium/windsurf/mcp_config.json` file is a JSON file that
> contains a list of servers that Cascade can connect to.

No project MCP path is quoted. Do not invent one.

## Shape

Top-level `mcpServers` map.

Quoted official stdio example:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_PERSONAL_ACCESS_TOKEN>"
      }
    }
  }
}
```

Quoted remote HTTP:

> It's important to note that for remote HTTP MCPs, the configuration is
> slightly different and requires a `serverUrl` or `url` field.

```json
{
  "mcpServers": {
    "remote-http-mcp": {
      "serverUrl": "<your-server-url>/mcp",
      "headers": {
        "API_KEY": "value"
      }
    }
  }
}
```

Launch is `command` **or** `serverUrl` **or** `url`. No `type` field is
required. Applying Claude's `url`-without-`type` rule is a false positive.

`windsurf.mcp.no-launch` fires when an entry has none of those three fields.

## Interpolation

Quoted:

> Two interpolation patterns are supported:
>
> - `${env:VAR_NAME}` — replaced with the value of the environment variable
>   `VAR_NAME`. If the variable is not set, it resolves to an empty string.
> - `${file:/path/to/file}` — replaced with the trimmed contents of the file
>   at the given path.

This scanner leaves both patterns unresolved. It does not read
`${file:...}` targets. Interpolated values are not treated as literal
secrets.

## Unread

- Devin CLI MCP config (no published path)
- MCP Marketplace / one-click deeplinks
- Team admin allowlists and custom registries
- OAuth credential stores
- Other files under `~/.codeium/` (never open credential dumps)

## Staleness risk: HIGH
