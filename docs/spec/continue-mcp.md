# Continue MCP (YAML)

**Source:** https://docs.continue.dev/customize/deep-dives/mcp
**Read:** 2026-08-31
**Depends on it:** `continue.mcp.no-launch`, `continue.mcp.missing-block-metadata`

## Project files

Workspace files used here:

- `.continue/config.yaml` — `mcpServers` array
- `.continue/mcpServers/*.{yaml,yml,json}` — one file per block, including
  YAML copied from the Continue registry **and** JSON copied from other tools

## Standalone YAML block metadata

Quoted:

> When creating a standalone block file in `.continue/mcpServers/`, remember to
> include the required metadata fields (`name`, `version`, `schema`) as shown in
> the Quick Start example above.

`continue.mcp.missing-block-metadata` applies **only** to standalone
`.continue/mcpServers/*.yaml` / `*.yml` documents. It does **not** apply to:

- copied JSON MCP configs in the same directory
- inline `mcpServers` in `.continue/config.yaml`

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

Quoted JSON copy-in:

> If you're coming from another tool that uses JSON MCP format configuration
> files (like Claude Desktop, Cursor, or Cline), you can copy those JSON config
> files directly into your `.continue/mcpServers/` directory […] and Continue
> will automatically pick them up.

`uses:` is a Continue registry field only. The same key on Claude, VS Code,
Cursor, Codex, Gemini, Antigravity, or OpenCode is not a launch method.

Do not apply Claude's `url`-without-`type` rule.

## Staleness risk: HIGH
