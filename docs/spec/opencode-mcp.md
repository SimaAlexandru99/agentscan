# OpenCode MCP (V1 and V2)

**Source:** https://opencode.ai/v2/docs/mcp-servers
**Read:** 2026-08-30
**Depends on it:** `opencode.mcp.no-launch`, `opencode.mcp.missing-type`, `opencode.mcp.local-without-command`, `opencode.mcp.remote-without-url`, `opencode.mcp.invalid-launch-for-type`

Also consulted for V1 shape: https://opencode.ai/docs/mcp-servers/

## Project files

Official examples use `opencode.jsonc` (JSONC). Also accepted: `opencode.json`.

## V2 discriminant

V2 groups servers under `mcp.servers`. Quoted:

> V2 does not place server names directly under `mcp`.

V2 local: `type` must be `"local"`; `command` is a required argv array.
V2 remote: `type` must be `"remote"`; `url` is required.
A V2 entry with no type, an unknown type, a local without command, a remote
without url, or a launch field that contradicts the declared type is a hard
error. Missing type is `opencode.mcp.missing-type`, not a generic no-launch.

## V1 (still documented)

V1 places named servers directly under `mcp`, with `type: "local"` + `command`
array, or `type: "remote"` + `url`, and an `enabled` flag (not V2 `disabled`).

Never apply V1 required fields to a V2 `mcp.servers` map.

A V1 object that declares neither `command` nor `url` (including
`{ "enabled": true }`) may inherit a server defined outside this file. Do not
emit a hard launch or type error when the launch data is not locally available.

Do not apply Claude's `url`-without-`type` rule. `uses:` is not a launch field
here.

## Staleness risk: HIGH
