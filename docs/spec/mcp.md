# MCP configuration

**Source:** https://code.claude.com/docs/en/mcp
**Read:** 2026-08-09
**Depends on it:** `mcp.no-launch`, `mcp.url-without-type`, `mcp.hardcoded-secret`, `mcp.literal-env`

## Top-level key

`mcpServers`. The docs use it 12 times; the string `"servers"` (the VS Code
spelling) appears zero times in the Claude Code MCP reference.

```json
{
  "mcpServers": {
    "database-tools": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": { "DB_URL": "${DB_URL}" }
    }
  }
}
```

Environment indirection with `${VAR}` is the documented shape — which is what
`mcp.literal-env` looks for the absence of.

## Transports

`stdio` (the default when `type` is absent), `http`, `sse`, `ws`.

## `url` without `type` is a configuration error

Quoted:

> A JSON entry that has a `url` but no `type` is a configuration error, because
> Claude Code reads an entry with no `type` as a stdio server. Claude Code skips
> that server and reports `MCP server "<name>" has a "url" but no "type"; add
> "type": "http" (or "sse" / "ws") to this entry`.

This is `mcp.url-without-type`, severity error. Zero occurrences across the 17
projects measured — it is here because the failure is silent at scan time, not
because it is common.

Before v2.1.202 the same misconfiguration surfaced as
`command: expected string, received undefined`, which is why `mcp.no-launch`
(neither `command` nor `url`) is a separate, still-valid check.

## Not verified

Whether other agent runtimes accept a `servers` key at one of the default
`mcpPaths`. If a user reports a false `mcp.no-launch` on a config that works for
them, that is the first thing to check — the bare-object fallback in
`parseMcpServers` would read a wrapper key as a server name.
