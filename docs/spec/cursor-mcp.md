# Cursor MCP

**Source:** https://cursor.com/docs/context/mcp
**Read:** 2026-09-02
**Depends on it:** `cursor.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`, `mcp.literal-credential`

## Project file

`.cursor/mcp.json` in the project. Global `~/.cursor/mcp.json` is outside a
normal project scan.

## Shape

Top-level `mcpServers`. Official examples:

- stdio: `command`, optional `args`, `env`
- remote: `url`, optional `headers`
- OAuth / `auth` object with secret-named keys such as `CLIENT_SECRET`

Config interpolation (not secrets): `${env:NAME}`, `${userHome}`,
`${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`, `${/}`.
A literal under `headers` or `auth` is `mcp.literal-credential` (field path
only; the value is never echoed).

The STDIO field table lists `type` as required for stdio. The remote example
uses `url` **without** `type`. Do **not** apply Claude's
`url`-without-`type` skip rule here — that sentence is not on this page.

Official security line: use environment variables for secrets, never hardcode
them.

## Staleness risk: HIGH
