# Codex MCP (config.toml)

**Source:** https://learn.chatgpt.com/docs/extend/mcp
**Also:** https://developers.openai.com/codex/config-advanced
**Read:** 2026-09-02
**Depends on it:** `codex.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `.codex/config.toml` walked from cwd to the git / scan boundary | yes |
| User | `$CODEX_HOME/config.toml`, or `~/.codex/config.toml` when unset | `--global` only |
| Profiles | `$CODEX_HOME/<name>.config.toml` | unread |
| System | `/etc/codex/config.toml` and managed preferences | unread |
| Requirements | admin `requirements.toml` | unread |
| Credentials | `$CODEX_HOME/auth.json` | never |

Quoted from the MCP page (2026-08-31):

> Codex stores MCP configuration in `config.toml` alongside other Codex
> configuration settings. By default this is `~/.codex/config.toml`, but you
> can also scope MCP servers to a project with `.codex/config.toml` (trusted
> projects only).

Quoted from config-advanced (2026-08-31):

> Codex stores its local state under `CODEX_HOME` (defaults to `~/.codex`).
>
> … `config.toml` (your local configuration)
> … `auth.json` (if you use file-based credential storage)

> In addition to your user config, Codex reads project-scoped overrides from
> `.codex/config.toml` files inside your repo. Codex walks from the project
> root to your current working directory and loads every `.codex/config.toml`
> it finds. If multiple files define the same key, the closest file to your
> working directory wins.

That last sentence is the **project walk**. It does not quote a same-name
user-vs-project replace (Grok’s “replaces it entirely”). This scanner
inventories both files when `--global` is on. Schema, runtime, and security
checks run on every readable `codex-toml` entry. Do not add `codexEffective`.

Quoted:

> Codex loads project-scoped config files only when the project is trusted.

`trust_level` is unread. This scanner does not skip project `.codex/` files.

CLI `--config` / empty-table clears are unread (not project files).

## Shape

Each server is a `[mcp_servers.<name>]` table.

STDIO: `command` (required), optional `args`, `env`, `env_vars`, `cwd`.

Streamable HTTP: `url` (required). No `type` field is required. Official
examples set `url` alone.

Quoted:

> Configure each MCP server with a `[mcp_servers.]` table.
>
> STDIO: `command` (required). Streamable HTTP: `url` (required).

Applying Claude's `url`-without-`type` rule to Codex is a false positive.

Other keys in `config.toml` are not MCP servers and must be ignored.
User-file `project_doc_max_bytes` / fallbacks / markers are not applied
from the `--global` user TOML (those knobs stay on the project walk).

Plugin-provided MCP and `.mcp.json` plugin blocks stay unread.

## Staleness risk: HIGH
