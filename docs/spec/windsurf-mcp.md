# Windsurf / Cascade MCP (`mcp_config.json`)

**Source:** https://docs.windsurf.com/windsurf/cascade/mcp (redirects to
https://docs.devin.ai/desktop/devin-local/customizations). The Cascade-specific
text now lives on https://docs.devin.ai/windsurf/plugins/cascade/mcp.md.
**Read:** 2026-11-14
**Depends on it:** `windsurf.mcp.no-launch`, `mcp.command-missing`,
`security.hardcoded-secret`, `mcp.literal-env`, `mcp.literal-credential`

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| User (Cascade, Cortex-managed) | `~/.config/devin/mcp_config.json` (`%AppData%/devin/mcp_config.json` on Windows; `$XDG_CONFIG_HOME` honored) | `--global` only |
| User (editor discovery only) | `~/.codeium/windsurf/mcp_config.json` (`~/.codeium/windsurf-next/...` for Next) | `--global` only; not the Cascade-managed file |
| Project | none quoted for Cascade | not invented |
| Devin Local | `.devin/mcp_config.json`, `.devin/mcp_config.local.json`, `~/.config/devin/mcp_config.json` (see [devin-mcp.md](devin-mcp.md)) | the CLI reader covers it |
| Marketplace / admin allowlists / OAuth stores | not project files | unread |

CHANGED-MEANING (2026-11-14): the old quote that Cascade's file is
`~/.codeium/windsurf/mcp_config.json` is replaced. The live Cascade page says:

> Cascade's **Open MCP config file** action opens the Cortex-managed file in the
> Devin configuration directory: macOS and Linux `~/.config/devin/mcp_config.json`.

> The editor's MCP discovery uses a separate, build-specific file:
> `~/.codeium/windsurf/mcp_config.json` for stable …

Rules affected: `windsurf.mcp.no-launch`, `mcp.command-missing`,
`security.hardcoded-secret`, `mcp.literal-env`, `mcp.literal-credential`
(the scanner's `--global` read targets the old path, not the one Cascade uses).

No project MCP path is quoted for Cascade. Do not invent one.

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

CHANGED-MEANING (2026-11-14): the live Cascade page documents only
`${env:VAR_NAME}` (example: `"API_KEY": "Bearer ${env:AUTH_TOKEN}"`), applied to
`command`, `args`, `env`, `serverUrl`, `url`, and `headers`. The `${file:...}`
form is documented only on the Devin CLI page
([devin-mcp.md](devin-mcp.md)). Rules affected: `mcp.literal-credential`.

This scanner leaves both patterns unresolved. It does not read
`${file:...}` targets. Interpolated values are not treated as literal
secrets. A secret-named `headers` value that is not interpolated is
`mcp.literal-credential`.

## Unread

- Devin CLI MCP config (no published path)
- MCP Marketplace / one-click deeplinks
- Team admin allowlists and custom registries
- OAuth credential stores
- Other files under `~/.codeium/` (never open credential dumps)

## Staleness risk: HIGH
