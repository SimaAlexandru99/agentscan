# Gemini CLI MCP

**Source:** https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
**Read:** 2026-08-30
**Depends on it:** `gemini.mcp.no-launch`

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

## Staleness risk: HIGH
