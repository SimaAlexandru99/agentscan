# Goose extensions (MCP servers in config.yaml)

**Source:** https://goose-docs.ai/docs/guides/config-files/
**Also:** https://github.com/aaif-goose/goose/blob/main/documentation/docs/getting-started/using-extensions.md (Config Entry, Remote extensions with a pre-registered OAuth client)
**Read:** 2026-11-14
**Depends on it:** (new)

Goose calls MCP servers "extensions". They live under the top-level
`extensions:` key of `config.yaml`. The key is a map: the map key is the
extension's id, not an MCP server list. There is no `mcpServers` key.

## Config file location

Quoted from the Configuration Files page:

> macOS/Linux: ~/.config/goose/config.yaml
> Windows: %APPDATA%\Block\goose\config\config.yaml

The Windows path is documented only on the docs site and the raw GitHub
page. It has not been exercised on a machine.

No project-level `config.yaml` is documented. Goose's project-scoped files
are hints and skills (see `goose-rules.md`, `goose-skills.md`).

## Shape

Quoted:

> Extensions are configured under the extensions key.

```yaml
extensions:
  extension_name:
    bundled: true/false       # Whether it's included with goose
    display_name: "Name"      # Human-readable name (optional)
    enabled: true/false       # Whether the extension is active
    name: "extension_name"    # Internal name
    timeout: 300              # Operation timeout in seconds
    type: "builtin"           # Extension type
    available_tools: []       # Filter to specific tools (empty = all)
```

Quoted type list:

> Supported extension types are builtin, platform, stdio, and streamable_http. SSE is not supported; migrate old SSE configurations to streamable_http.

So `type: sse` is not a valid value. Do not accept it as a launch type.

## Launch fields by type

Quoted stdio example (Configuration Files page):

```yaml
extensions:
  filesystem:
    type: stdio
    name: filesystem
    enabled: true
    cmd: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    env_keys: []
    envs: {}
    timeout: 300
```

Quoted streamable_http example (same page):

```yaml
extensions:
  remote-tools:
    type: streamable_http
    name: remote-tools
    enabled: true
    uri: "https://example.com/mcp"
    headers: {}
    env_keys: []
    envs: {}
    timeout: 300
```

- stdio: `cmd` (command), `args` (list), `envs` (map), `env_keys` (list).
- streamable_http: `uri` (not `url`), `headers` (map), `envs`, `env_keys`.
- builtin / platform: no `cmd` or `uri` in the documented examples.

The Using Extensions page shows a stdio entry without `env_keys`:

> ```yaml
> extensions:
>   github:
>     name: GitHub
>     cmd: npx
>     args: [-y @modelcontextprotocol/server-github]
>     enabled: true
>     envs: { "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>" }
>     type: stdio
>     timeout: 300
> ```

Note: `args: [-y @modelcontextprotocol/server-github]` in YAML flow style
parses as a single string element `-y @modelcontextprotocol/server-github`,
not two arguments. The official example itself is ambiguous. Do not infer
argument splitting from it.

The `envs` map is the place where the official example puts a token value
literally (`"<YOUR_TOKEN>"` as a placeholder). The docs warn against storing
secrets in this file:

> Avoid storing sensitive information (API keys, tokens) in the config file

The docs also say that `envs` / `env_keys` values can come from goose's
secret store:

> `client_secret_key`: the name of an env/secret key holding the client
> secret, resolved from `envs`/`env_keys` or goose's secret store (`goose
> configure` > extension secrets).

## Remote OAuth fields (streamable_http)

Quoted from the Using Extensions page:

```yaml
extensions:
  remote-example:
    name: Remote Example
    type: streamable_http
    uri: https://example.com/mcp
    client_id: <YOUR_REGISTERED_CLIENT_ID>
    client_secret_key: REMOTE_EXAMPLE_OAUTH_SECRET
    scopes:
      - example.readonly
    enabled: true
    timeout: 300
```

`client_id` supports `$VAR` / `${VAR}` substitution. `client_secret_key` names
a secret; the secret value never goes in the config file. Omit both for
clients that use Client ID Metadata Documents or Dynamic Client Registration.

## Tool filtering

Quoted:

> Use the available_tools field to limit which tools are loaded from an extension. List the tool names you want — only those will be available to goose. Leave it empty (the default) to load all tools.

## Precedence

Quoted:

> Settings are applied in the following order of precedence:
> Environment variables (highest priority)
> Config file settings
> Default values (lowest priority)

Direct edits to the file usually need a goose restart for existing sessions.

## Unverified

- Whether `cmd`, `args`, `uri` are required per type. The docs show them
  in examples only; no "required" statement was found.
- Whether `$VAR` interpolation applies to `args`, `envs`, `headers` or `uri`.
  The docs state it only for `client_id`.
- Exact semantics of `env_keys` versus `envs` beyond the prose above. The
  official examples leave `env_keys: []`.
- Whether a `url` key is accepted as an alias for `uri` in config.yaml. The
  docs use `uri` only (the `url` key appears only in deeplink query params).
- Whether `type` may be omitted (defaulting to stdio when `cmd` is set). Not
  documented.
- Whether `extensions:` entries accept `command`/`url` names used by other
  MCP clients. Not documented.
- Hook events and handler fields: the docs nav lists Hooks, but this capture
  did not read them. No `goose-hooks.md` was written.
- Custom Agents / Subagents pages (also in the nav) were not read.

## Files

| Scope | Path | Proposed agentscan use |
|-------|------|------------------------|
| User (macOS/Linux) | `~/.config/goose/config.yaml` | read: `extensions` map |
| User (Windows) | `%APPDATA%\Block\goose\config\config.yaml` | read, unverified path |
| Secrets (file-based) | `secrets.yaml`, base directory not stated in the docs (used when goose falls back to file storage) | never |
| Runtime permissions | `permissions/tool_permissions.json` (auto-managed), base directory not stated | never |

No project-level MCP config path is documented for goose.

## Staleness risk: HIGH

The product was renamed (block/goose to aaif-goose/goose), and the docs nav
mentions Goose2 and ACP settings that change the config flow. Re-read before
relying on any field here.
