# Antigravity MCP

**Source:** https://antigravity.google/docs/mcp
**Read:** 2026-11-14
**Re-read:** 2026-09-07
**Depends on it:** `antigravity.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

## Project file

Workspace local setup: `.agents/mcp_config.json`.
Global: `~/.gemini/config/mcp_config.json` — opened under `--global` only.

## Shape

Top-level `mcpServers`. Each entry's transport is **one required** of:

- `command` (string) — stdio
- `serverUrl` (string) — remote Streamable HTTP

Quoted (2026-11-12):

> Each server entry under `mcpServers` must specify **one transport property**
> (`command` for a local `stdio` server, or `serverUrl` for a remote
> Streamable HTTP server).

> **`serverUrl`** … You can also use `url`.

`url` is an alias of `serverUrl`. An entry with only `url` is launchable.
Quoted (2026-11-14):

> The legacy HTTP+SSE transport and the httpUrl field aren't supported.

An entry that has only `httpUrl` is
`antigravity.mcp.no-launch`.

Optional fields include `args`, `env`, `cwd`, `headers`, `authProviderType`,
`oauth`, `disabled`, `disabledTools`.

## Staleness risk: HIGH
