# Gemini CLI MCP

**Source:** https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
**Read:** 2026-08-31
**Depends on it:** `gemini.mcp.no-launch`, `gemini.mcp.underscore-alias`

## Project file

Project config: `.gemini/settings.json` (`mcpServers` object).
User config `~/.gemini/settings.json` is outside a normal project scan.

## Launch fields

Quoted configuration properties:

- `command` (string) — Stdio transport
- `url` (string) — SSE endpoint
- `httpUrl` (string) — HTTP streaming endpoint

An entry with none of those three is not launchable by this schema.
Do not apply Claude's `url`-without-`type` rule.

Official example uses `npx` and `$VAR` / env indirection for secrets.

## Underscore in server aliases

Quoted warning (read 2026-08-31):

> Do not use underscores (`_`) in your MCP server names (for example, use
> `my-server` rather than `my_server`). The policy parser splits Fully Qualified
> Names (`mcp_server_tool`) on the _first_ underscore following the `mcp_`
> prefix. If your server name contains an underscore, the parser will
> misinterpret the server identity, which can cause wildcard rules and security
> policies to fail silently.

`gemini.mcp.underscore-alias` is a vendor-recommendation **warning** when the
alias contains `_`. It is not a load failure.

## Staleness risk: HIGH
