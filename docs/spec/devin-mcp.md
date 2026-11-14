# Devin CLI MCP

**Source:** https://docs.devin.ai/cli/extensibility/mcp/configuration
**Read:** 2026-11-14
**Depends on it:** `devin.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

Re-read 2026-11-14: URL unchanged. Paths, `url`/`transport` fields and the
pre-v3000.3 note still match. Added: `mcpServers` entries found in the main
config files are migrated to the dedicated files automatically on startup.
Also confirmed: `${env:VAR}` and `${file:/path}` expansion applies to
`oauthClientSecret` and `oauthResource`.

JetBrains Cascade `serverUrl` stays [windsurf-mcp.md](windsurf-mcp.md). This
page's remote field is `url`.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `.devin/mcp_config.json`, `.devin/mcp_config.local.json` | yes |
| Project, pre-v3000.3 | `mcpServers` inside `.devin/config.json` and `.devin/config.local.json` | yes, only when the key is present |
| User | `~/.config/devin/mcp_config.json` and `mcpServers` in `~/.config/devin/config.json` | `--global` only |

A config file with hooks and no `mcpServers` is not a shape error. Windows
`%APPDATA%\devin\` is unread.

## Shape

Top-level `mcpServers`. Local servers require `command`. Remote servers
require `url`. Optional `transport` is `"http"` (default) or `"sse"`. Both
are valid. No transport check. `serverUrl` is not a launch field here: an
entry with only `serverUrl` is `devin.mcp.no-launch`.
