# Continue MCP (YAML)

**Source:** https://docs.continue.dev/customize/deep-dives/mcp
**Read:** 2026-08-30
**Depends on it:** `continue.mcp.no-launch`

## Project files

Workspace files used here:

- `.continue/config.yaml` — `mcpServers` array
- `.continue/mcpServers/*.{yaml,yml,json}` — one file per block, including
  YAML copied from the Continue registry

## Shape

Quoted properties:

- `name` — display name
- `command` — start the stdio server
- `args` — optional
- `type` — `sse`, `stdio`, or `streamable-http`
- `url` — for remote transports
- `uses` — registry reference (`continuedev/continue-docs-mcp`)

Launch is `command`, `url`, or `uses`. A `uses:` block is a
`registry-reference`, not a missing launch field. Official command examples
use `npx` / `uvx` and `${{ secrets.NAME }}` interpolation (not a literal secret).

Do not apply Claude's `url`-without-`type` rule.

## Staleness risk: HIGH
