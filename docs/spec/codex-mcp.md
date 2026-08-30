# Codex MCP (config.toml)

**Source:** https://learn.chatgpt.com/docs/extend/mcp
**Read:** 2026-08-30
**Depends on it:** `codex.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

The developers.openai.com Codex pages were unreachable at capture time. This
file quotes ChatGPT Learn, which documents the same Codex host config.

## Project file

Default user file: `~/.codex/config.toml` (outside a normal project scan).

Project scope: `.codex/config.toml` (trusted projects only).

## Shape

Each server is a `[mcp_servers.<name>]` table.

STDIO: `command` (required), optional `args`, `env`, `env_vars`, `cwd`.

Streamable HTTP: `url` (required). No `type` field is required. Official
examples set `url` alone.

Quoted:

> Codex stores MCP configuration in `config.toml` … you can also scope MCP
> servers to a project with `.codex/config.toml` (trusted projects only).
> Configure each MCP server with a `[mcp_servers.]` table.

> STDIO: `command` (required). Streamable HTTP: `url` (required).

Applying Claude's `url`-without-`type` rule to Codex is a false positive.

Other keys in `config.toml` are not MCP servers and must be ignored.

## Staleness risk: HIGH
