# MCP configuration

**Source:** https://code.claude.com/docs/en/mcp
**Read:** 2026-08-09
**Depends on it:** `mcp.no-launch`, `mcp.url-without-type`, `mcp.hardcoded-secret`, `mcp.literal-env`, `mcp.command-missing`

## Shared path `.mcp.json`

`.mcp.json` is also Command Code's project-scope MCP file. Do not assume
the path is Claude-only. Command Code documents `transport: "http" | "stdio"`
with `type` as an alias; a valid Command Code HTTP entry has `transport` and
`url` and no `type`. That shape must not emit `claude.mcp.url-without-type`.
See [commandcode-mcp.md](commandcode-mcp.md). `.claude/mcp.json` remains
Claude-only and still requires `type` for a remote `url`.

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
`mcp.literal-env` looks for the absence of. Path-like `command` values (relative
or absolute filesystem paths) are what `mcp.command-missing` compares to disk;
bare PATH binaries (`npx`, `uvx`, `node`) and unresolved env vars such as
`${CLAUDE_PLUGIN_ROOT}` are not checked — the tool refuses to invent a PATH
lookup.

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

## `command` path missing on disk

`mcp.command-missing` is an internal-consistency check, same shape as
`hook.missing-script`: a config entry asserts a filesystem path, and the path
is not a file. It does **not** claim to know whether a bare binary on `PATH`
would launch — that would require a PATH search this tool refuses to invent.

Only path-like values are eligible (`./server`, `bin/server`, absolute paths,
`$CLAUDE_PROJECT_DIR/...`). Shell metacharacters and spaces skip the check.

## What this tool does not claim

Schema and secrets checks (`mcp.no-launch`, `mcp.url-without-type`,
`mcp.hardcoded-secret`, `mcp.literal-env`) judge whether an entry is
**misconfigured / unlaunchable by schema**. They do not spawn servers or prove
that a correctly shaped entry will start at runtime. Marketing copy should say
the same.

## Not verified

Whether other agent runtimes accept a `servers` key at one of the default
`mcpPaths`. If a user reports a false `mcp.no-launch` on a config that works for
them, that is the first thing to check — the bare-object fallback in
`parseMcpServers` would read a wrapper key as a server name.
