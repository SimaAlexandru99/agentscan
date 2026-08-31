# Command Code MCP

**Source:** https://commandcode.ai/docs/mcp
**Read:** 2026-08-31
**Depends on it:** `commandcode.mcp.invalid-transport`, `commandcode.mcp.http-without-url`, `commandcode.mcp.stdio-without-command`

Also consulted: https://commandcode.ai/docs/settings (scopes, inline `mcp.servers`, files this scanner must not open)

## Shared project file

Project-scope MCP is `.mcp.json` at the project root, wrapper `mcpServers`.
This path is **not Claude-only**. Command Code writes it for `--scope project`.
Claude Code also uses `.mcp.json`. A check keyed only to Claude on this path
is a false positive on valid Command Code config.

## Transports

CLI `--transport` accepts `stdio` or `http`. Default is `stdio`.

Quoted:

> The JSON accepts `type` as an alias for `transport`.

Official project-scope example:

```json
{
  "mcpServers": {
    "stripe": {
      "transport": "http",
      "url": "https://mcp.stripe.com"
    }
  }
}
```

That entry has a `url` and no `type`. It must not emit
`claude.mcp.url-without-type`.

HTTP schema (docs Config Schema tab): `transport: "http"`, `url`, optional
`enabled`, `headers`, `env`. Stdio is the other documented transport and is
specified with `command` (CLI stdio add, and the stdio JSON tab).

Do not treat `sse` / `ws` on a shared `.mcp.json` as a Command Code error:
those are Claude transports on the same path. Prefer skip over a false
positive. An unknown value such as `"ftp"` is invalid for both consumers.

## Scopes

| Scope | File | When agentscan reads it |
|-------|------|-------------------------|
| project | `.mcp.json` | always (shared MCP JSON profile) |
| user | `~/.commandcode/mcp.json` | `--global` / `includeGlobal` |
| settings inline | `mcp.servers` in the settings.json family | always for project files; user settings under `--global` |
| local | `~/.commandcode/projects/{project}/mcp.json` | only if the project slug can be resolved from a published rule |

The sessions page says local state is "keyed by a slug of the working
directory" but does not publish the encoding. Until it does, do **not**
invent a slug or scan sibling `projects/*` directories.

MCP precedence (low → high), quoted from settings:

> settings.json `mcp.servers` < user `mcp.json` < project `.mcp.json` < local `projects/{project}/mcp.json`

agentscan inventories each readable source. It does not hide a lower-precedence
entry.

## Do not read

`~/.commandcode/auth.json`, `~/.commandcode/mcp-tokens.json`, and other token
files. OAuth client secrets are stripped from project `.mcp.json` and stored
in `mcp-tokens.json`. Scanning those files would copy secrets into facts.

## What this tool does not claim

It does not spawn servers, complete OAuth, or prove a correctly shaped entry
will connect. `${VAR}` in config values is resolved at Command Code runtime.

## Staleness risk: HIGH
