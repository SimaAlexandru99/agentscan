# Qwen Code MCP

**Source:** https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/
**Also:** https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md
**Also:** https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/ (the `mcpServers` table)
**Read:** 2026-11-14
**Depends on it:** (new) — proposed `qwen.mcp.*` rules; reuse of the Gemini launch and env parsers is listed under "Gemini comparison"

## Project file

Quoted:

> Qwen Code loads MCP servers from `mcpServers` in your `settings.json`.

Scopes, quoted:

> User scope (default): `~/.qwen/settings.json` across all projects on your machine
>
> Project scope: `.qwen/settings.json` in your project root

`mcpServers` is a top-level key of `settings.json`. The settings page example
puts it at the root beside `proxy`, `general`, `tools` and `context`.

Settings-page wording for the key: "Configures connections to one or more
Model-Context Protocol (MCP) servers". Only `mcpServers` holds server entries.
Global allow and deny lists live in a separate top-level `mcp` object:

> `mcp.allowed`: allow-list of MCP server names (keys in `mcpServers`)
>
> `mcp.excluded`: deny-list of MCP server names

Both support `*` and `?` glob patterns. `mcp.excluded` wins when a name matches
both.

## Launch fields

Quoted from the settings table, "Required (one of the following)":

- `command` — "Path to the executable for Stdio transport"
- `url` — "SSE endpoint URL (e.g., "http://localhost:8080/sse")"
- `httpUrl` — "HTTP streaming endpoint URL"

An entry with none of the three is not launchable. The transport table maps
`httpUrl` to `http` (recommended), `url` to `sse` (legacy), and `command` to
`stdio`. There is no `type` key in the documented config. The only `type`
appears in the subagent frontmatter example (see below).

Other documented entry fields, from the settings table:

| Field | Type | Notes |
|-------|------|-------|
| `args` | array | stdio arguments |
| `env` | object | "Environment variables to set for the server process." |
| `cwd` | string | stdio working directory |
| `headers` | object | sent with `url` or `httpUrl` |
| `timeout` | number | ms. Tool-call timeout; default 600000 |
| `trust` | boolean | skips that server's tool-call confirmations in a trusted workspace |
| `description` | string | display only |
| `includeTools` | array | allowlist of tool names |
| `excludeTools` | array | denylist; wins over `includeTools` |
| `discoveryTimeoutMs` | number | Handshake only. Defaults: stdio 30 s, remote HTTP/SSE 5 s |
| `versionNegotiation` | string | `"auto"` opts a stdio server into modern protocol negotiation |
| `oauth` | object | `enabled`, `clientId`, `clientSecret`, `authorizationUrl`, `tokenUrl`, `redirectUri`, `scopes`, `tokenParamName`, `audiences` |

Quoted example (stdio, from the MCP page):

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

## Env interpolation

Quoted, settings page:

> String values within your settings.json files can reference environment
> variables using either `$VAR_NAME` or `${VAR_NAME}` syntax. These variables
> will be automatically resolved when the settings are loaded.

The statement covers "String values within your settings.json files", so it is
not limited to `env`. The docs do not document `%VAR%` (Windows) syntax.

## Token file (never opened)

Quoted:

> Stored in `~/.qwen/mcp-oauth-tokens.json` (plaintext, mode 0600) by default.
> If `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` is set, Qwen Code uses
> keychain-backed storage where available, or `~/.qwen/mcp-oauth-tokens-v2.json`
> with AES-256-GCM encryption.

agentscan does not open either token file.

## Scope of this capture

Not documented here: `.mcp.json` (no mention in the Qwen docs, so do not read
it), MCP prompts/resources, and the `qwen mcp` CLI output format. Those do not
affect the launch-field contract.

## Gemini comparison

Compared with [gemini-mcp.md](gemini-mcp.md) (read 2026-11-14 capture plus the
2026-09-03 re-read). Gemini's file is `.gemini/settings.json`, Qwen's is
`.qwen/settings.json`.

**Same, so the Gemini parser can be reused for these:**

- Project and user paths: `.<vendor>/settings.json` and `~/.<vendor>/settings.json`.
- Top-level `mcpServers` object.
- Launch trio `command` / `url` / `httpUrl`, same meaning, and "none of the three"
  means not launchable.
- `$VAR` and `${VAR}` interpolation.
- `timeout` in milliseconds.
- `trust`, `headers`, `cwd`, `args`, `includeTools`, `excludeTools`.

**Differs. Do not reuse the Gemini behavior here:**

1. **Windows `%VAR%` interpolation.** Gemini documents `%VAR_NAME%` (Windows
   only). Qwen documents only `$VAR_NAME` and `${VAR_NAME}`. The Gemini `%VAR%`
   branch must be off for Qwen. A `%VAR%` value in a Qwen file is not documented
   as an interpolation.
2. **Underscore alias warning.** Gemini's `gemini.mcp.underscore-alias` rests on
   a quoted Gemini warning. The Qwen docs contain no such warning. Do not port
   that rule to Qwen without a Qwen source.
3. **Extra fields.** Qwen documents `discoveryTimeoutMs`, `versionNegotiation`,
   `oauth`, `description`, and the top-level `mcp.allowed` / `mcp.excluded` lists.
   None are in the Gemini capture.
4. **Discovery timeouts.** Qwen has per-transport handshake defaults (30 s stdio,
   5 s remote). The Gemini capture records none.
5. **Default tool-call timeout.** Qwen states 600000 ms. The Gemini capture does
   not record a default.
6. **Project and user file meaning.** Qwen's user file is always read. The Gemini
   capture reads `~/.gemini/settings.json` only under `--global`. The Qwen docs
   name no such flag for MCP.

## Files

| Scope | Path | Opened by agentscan |
|-------|------|---------------------|
| Project | `<project>/.qwen/settings.json` (`mcpServers`, `mcp`) | planned: yes |
| User | `~/.qwen/settings.json` (`mcpServers`, `mcp`) | planned: yes, under `--global` as with Gemini |
| Token store | `~/.qwen/mcp-oauth-tokens.json`, `~/.qwen/mcp-oauth-tokens-v2.json` | no, never |
| Not documented | `.mcp.json`, `.qwen/mcp.json` | no |

## Unverified

- Whether `mcpServers` entries in a project `.qwen/settings.json` need approval
  before they run. The MCP page describes `trust` only. The hooks page describes
  an approval gate for project hooks, which is a different mechanism.
- Whether `~/.qwen/settings.json` is read by `qwen` only, or by the `qwen mcp`
  CLI too. The docs say the CLI "writes to user scope by default", which is
  consistent with that file.
- Whether `type` is accepted inside `mcpServers` in `settings.json`. The
  subagent frontmatter example uses `type: stdio`. The top-level MCP docs never do.
- Whether `$VAR` interpolation is applied to `args` and `url`, or only to values
  the settings page names. The settings text covers all "string values", so
  this is probably yes. Not confirmed per field.

## Staleness risk: MEDIUM

The page changes often. Its 2026 additions (`discoveryTimeoutMs`,
`versionNegotiation`, progressive availability) do not appear in older captures.
Re-read before changing the launch-field rule.
