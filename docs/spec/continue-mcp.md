# Continue MCP (YAML)

**Source:** https://docs.continue.dev/customize/deep-dives/mcp
**Read:** 2026-08-30
**Depends on it:** `continue.mcp.no-launch`

## Project files

Servers are listed under `mcpServers` in `config.yaml`. Workspace file used
here: `.continue/config.yaml`.

## Shape

Quoted properties:

- `name` — display name
- `command` — start the stdio server
- `args` — optional
- `type` — `sse`, `stdio`, or `streamable-http`
- `url` — for remote transports

Launch is `command` or `url`. Official examples use `npx` / `uvx` and
`${{ secrets.NAME }}` interpolation (not a literal secret).

Do not apply Claude's `url`-without-`type` rule.

## Staleness risk: HIGH
