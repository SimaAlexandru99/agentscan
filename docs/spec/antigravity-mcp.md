# Antigravity MCP

**Source:** https://antigravity.google/docs/mcp
**Read:** 2026-09-02
**Depends on it:** `antigravity.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

## Project file

Workspace local setup: `.agents/mcp_config.json`.
Global (unread on a normal project scan): `~/.gemini/config/mcp_config.json`.

## Shape

Top-level `mcpServers`. Each entry's transport is **one required** of:

- `command` (string) — stdio
- `serverUrl` (string) — remote Streamable HTTP or SSE

Quoted:

> Transport (one required): `command` (string); `serverUrl` (string).

`url` and `httpUrl` are **not** listed as launch fields. An entry that has
only `url` is not launchable by this schema. Quoted (2026-09-02):

> Remote Connection Schema: When declaring remote SSE, Streamable HTTP, or
> websocket-based MCP connections, you must define the `serverUrl` field.
> Legacy fields like `url` or `httpUrl` are not supported.

Optional fields include `args`, `env`, `cwd`, `headers`, `authProviderType`,
`oauth`, `disabled`, `disabledTools`.

## Staleness risk: HIGH
