# Gemini CLI MCP

**Source:** https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
**Read:** 2026-09-02
**Depends on it:** `gemini.mcp.no-launch`, `gemini.mcp.underscore-alias`, `mcp.literal-env`

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

## Env interpolation (read 2026-09-02)

Quoted:

> `env` (object): Environment variables for the server process. Values can
> reference environment variables using `$VAR_NAME` or `${VAR_NAME}` syntax
> (all platforms), or `%VAR_NAME%` (Windows only).

`%VAR_NAME%` is therefore interpolation, not a literal, and `mcp.literal-env`
must not fire on it. Before 2026-09-02 the interpolation regex did not know
the Windows form and reported `"GITHUB_TOKEN": "%GITHUB_TOKEN%"` as a literal
secret at severity warning.

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
