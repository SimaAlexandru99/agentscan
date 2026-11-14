# Factory Droid MCP servers

**Source:** https://docs.factory.com/harness/mcp (same text at https://docs.factory.com/cli/configuration/mcp)
**Read:** 2026-11-14
**Depends on it:** `factory.mcp.no-launch`

Quoted:

> MCP server configurations are stored in `mcp.json` files at three levels:

Levels (table in the page): `~/.factory/mcp.json` (User); `.factory/mcp.json` in an ancestor directory of the project (Folder); `.factory/mcp.json` in the project root (Project).

Server map key is `mcpServers`. Quoted JSON examples use `"type": "http"`, `"type": "sse"`, and stdio entries with no `type` key.

> Each server entry accepts these common fields:

| Field | Type | Description |
| :---- | :--- | :---------- |
| `type` | `"stdio" \| "http" \| "sse"` | Transport. May be omitted for stdio servers, which default to `stdio`. |
| `disabled` | `boolean` | Temporarily disable the server (default: `false`). |
| `enabledTools` | `string[]` | Tool names to allow from this server. When the list is non-empty, only these tools are loaded. |
| `disabledTools` | `string[]` | Tool names to exclude from this server. |
| `timeout` | `number` | Tool call timeout in milliseconds. |
| `connectTimeout` | `number` | Connection timeout in milliseconds. Default 10000 for `http`/`sse`, 30000 for `stdio`. |

> **stdio** servers use `command` (the executable), `args` (an array of arguments), and `env` (an object of environment variables).

> **http** and **sse** servers use `url` (the endpoint), `headers` (an object of HTTP headers), and `oauth` (OAuth overrides, or `false` to disable OAuth entirely).

> Expansion applies to credential-bearing fields only:
> - `env` values for **stdio** servers.
> - `headers` values for **http** and **sse** servers.
> - `oauth.clientId` and `oauth.clientSecret` for **http** and **sse** servers.
>
> It does **not** apply to `command`, `args`, or `url`.

Expansion syntax is `${NAME}` only, resolved at connect time; `mcp.json` is never rewritten.

> Project-level `.factory/mcp.json` is committed to the repo. Never put secrets there: header auth tokens (such as `Authorization`), `oauth.clientSecret`, or API keys.

Other documented facts: `droid mcp add` writes to the user config. Project servers cannot be removed with `droid mcp remove`. Enterprise `mcpPolicy` lives in managed settings, not in `mcp.json`. Droid reloads when an `mcp.json` file changes.

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| User | `~/.factory/mcp.json` | `--global` only |
| Folder | `.factory/mcp.json` in an ancestor directory of the project | yes, on the ancestor walk |
| Project | `.factory/mcp.json` in the project root | yes |

## Unverified

- Precedence when the same server name is defined at more than one level. The page says "Droid loads one definition for it" but does not state which level wins among User, Folder and Project (only that Organization-managed servers and `mcpPolicy` win).
- Whether `type` is required on `http`/`sse` entries. The page says only that it "May be omitted for stdio servers".
- Whether a `command`-less entry with `url` is inferred as http. Not stated.
- Whether `mcpServers` may appear in `settings.json`. The settings reference (https://docs.factory.com/droid-cli/settings) has no MCP server key; only `mcpPolicy`, `mcpAutonomyOverrides` and `mcpAutonomyUrlOverrides` (enterprise) and `blockOnMcpLoad`.

## Staleness risk: HIGH
