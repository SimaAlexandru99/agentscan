# OpenCode MCP (V1 and V2)

**Source:** https://opencode.ai/v2/docs/mcp-servers
**Read:** 2026-08-30
**Depends on it:** `opencode.mcp.no-launch`

Also consulted for V1 shape: https://opencode.ai/docs/mcp-servers/

## Project files

Official examples use `opencode.jsonc` (JSONC). Also accepted: `opencode.json`.

## V2 discriminant

V2 groups servers under `mcp.servers`. Quoted:

> V2 does not place server names directly under `mcp`.

V2 local: `type` must be `"local"`; `command` is a required argv array.
V2 remote: `type` must be `"remote"`; `url` is required.

## V1 (still documented)

V1 places named servers directly under `mcp`, with `type: "local"` + `command`
array, or `type: "remote"` + `url`, and an `enabled` flag (not V2 `disabled`).

Never apply V1 required fields to a V2 `mcp.servers` map.

Do not apply Claude's `url`-without-`type` rule.

## Staleness risk: HIGH
