# Copilot CLI MCP

**Source:** https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
**Read:** 2026-11-14
**Depends on it:** `vscode.mcp.no-launch`, `mcp.command-missing`

Quoted (`mcp-config.json` section):

> Defines MCP (Model Context Protocol) servers available at the user level.
> These servers are available in all your sessions, regardless of which project
> directory you're in. Project-level MCP configurations (in `.mcp.json` or
> `.github/mcp.json`) take precedence over user-level definitions when server
> names conflict.

## Files

| Scope | Path | Read by agentscan |
|-------|------|-------------------|
| Project | `.github/mcp.json` | yes, as `copilot-json` (same shape as `~/.copilot/mcp-config.json`) |
| Project | `.mcp.json` | yes, through the shared workspace-root reader (see [vscode-mcp.md](vscode-mcp.md)) |
| User | `~/.copilot/mcp-config.json` | `--global` only |

The page states only the location and precedence. Server shape follows the
user file (see [vscode-mcp.md](vscode-mcp.md)).
