# Zed MCP

**Source:** https://zed.dev/docs/ai/mcp
**Also:** https://github.com/zed-industries/zed/blob/main/docs/src/ai/mcp.md (same text, read 2026-11-14)
**Settings file:** https://zed.dev/docs/configuring-zed (raw: https://github.com/zed-industries/zed/blob/main/docs/src/configuring-zed.md)
**Read:** 2026-11-14
**Depends on it:** `zed.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| User (Linux, macOS) | `~/.config/zed/settings.json` (or `$XDG_CONFIG_HOME/zed/settings.json`) | yes (planned) |
| User (Windows) | `%APPDATA%\Zed\settings.json` | yes (planned, Windows only) |
| Project | `<worktree>/.zed/settings.json` | yes (planned), only if trusted, see below |

## Config key

MCP servers live under the top-level `context_servers` object in the Zed
settings file. Quoted example from the page:

> ```
> {
>   "context_servers": {
>     "local-mcp-server": {
>       "command": "some-command",
>       "args": ["arg-1", "arg-2"],
>       "env": {}
>     },
>     "remote-mcp-server": {
>       "url": "https://example.com/mcp",
>       "headers": { "Authorization": "Bearer <token>" }
>     },
>     "remote-mcp-server-with-oauth": {
>       "url": "https://mcp.example.com/mcp"
>     }
>   }
> }
> ```

The page states that entries come from the Settings UI ("Add Local Server" or
"Add Remote Server") and "will create entries in your settings file".

## Entry fields

Local (stdio) entry: `command` (string), `args` (array of strings), `env`
(object). The page shows `command` as a plain string with `args` as a sibling
key, never as an object.

Remote entry: `url` (string), optional `headers` (object). Quoted:

> Note: When a remote MCP server has no configured `"Authorization"` header, Zed will prompt you to authenticate yourself against the MCP server using the standard MCP OAuth flow.

No `source`, `type`, or `transport` key is documented on `context_servers`
entries. `"type": "custom"` appears only under `agent_servers` (External
Agents), not under `context_servers`.

## Settings file syntax

Quoted from https://zed.dev/docs/configuring-zed:

> The syntax is JSON with support for `//` comments.

This is JSON with `//` line comments (JSONC-style). The page does not mention
`/* */` block comments or trailing commas. Parsers must strip `//` comments
before `JSON.parse`, and should not assume strict JSON.

## Project settings and trust

Quoted from https://zed.dev/docs/configuring-zed:

> Override user settings for a specific project by creating a `.zed/settings.json` file in your project root.

Quoted from https://zed.dev/docs/worktree-trust (restricted mode list):

> Project settings (`.zed/settings.json`) from being parsed and applied

Project settings are not applied until the worktree is trusted. The configuring
page also says project settings are "limited to editor behavior and language
tooling options", which does not list `context_servers`.

## Tool permissions key

Quoted:

> MCP tools use the key format `mcp:<server>:<tool_name>` — for example, `mcp:github:create_issue`.

## Unverified

- Whether `command` also accepts an object form such as `{path, args, env}`. Not shown in any official page read.
- Whether a `type` or `transport` key is accepted or required on remote entries. Not documented.
- Whether `$VAR` / `${VAR}` interpolation works in `env` or `headers` values. Not documented.
- Whether `context_servers` is honored inside project `.zed/settings.json`. The configuring page's list of project-level keys omits it.
- Whether a per-server disable key exists. Not found.
- `~/.zed/settings.json` on macOS: not documented; the docs list `~/.config/zed/settings.json` for macOS.
- The `zed.dev/docs/ai/rules` URL now returns 404; project instructions moved to `zed.dev/docs/ai/instructions` (see zed-rules.md).

## Staleness risk: HIGH

## Extension-provided servers

Quoted (https://zed.dev/docs/ai/mcp, "As Extensions", read 2026-11-14):

> One of the ways you can use MCP servers in Zed is by exposing them as an extension.

An installed extension's entry in `context_servers` carries only `settings`
(plus `enabled` / `remote`), with no `command` or `url`. agentscan treats such
an entry as launchable, so `zed.mcp.no-launch` does not fire on it. Secrets in
`settings` are still checked.
