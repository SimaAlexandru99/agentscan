# Claude Desktop MCP (claude_desktop_config.json)

**Source:** https://modelcontextprotocol.io/docs/develop/connect-local-servers
**Also:** https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp (remote connectors, a separate mechanism; article dateModified 2026-11-13)
**Read:** 2026-11-14
**Depends on it:** (new)

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| User, macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` | planned |
| User, Windows | `%APPDATA%\Claude\claude_desktop_config.json` | planned |
| User, Linux | `~/.config/Claude/claude_desktop_config.json` | planned |
| Project | none documented | never |
| Logs | `~/Library/Logs/Claude`, `%APPDATA%\Claude\logs`, `~/.config/Claude/logs` | unread |

No project-level config file is documented. The config file is per user,
per OS.

Quoted (MCP page, Step 2 "Access Developer Settings"):

> This action creates a new configuration file if one doesn't exist, or opens your existing configuration. The file is located at:
>
> macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
>
> Windows: `%APPDATA%\Claude\claude_desktop_config.json`
>
> Linux: `~/.config/Claude/claude_desktop_config.json`

Path to open it: Settings (Claude menu, "Settings…") > Developer tab >
"Edit Config".

## Shape

Top-level key: `mcpServers`, an object keyed by a friendly server name.

Quoted (MCP page, Step 3, Windows example):

> "mcpServers": { "filesystem": { "command": "npx", "args": [ "-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\username\\Desktop", "C:\\Users\\username\\Downloads" ] } }

Entry fields quoted from "Understanding the Configuration":

- `"filesystem"`: "A friendly name for the server that appears in Claude Desktop"
- `"command": "npx"`: "Uses Node.js's npx tool to run the server"
- `args`: the example passes `-y` and the package name, then "The remaining arguments: Directories the server is allowed to access". Package-specific; the docs do not define `args` semantics beyond this.
- `env`: documented only in troubleshooting. Quoted: "you may need to add the expanded value of `%APPDATA%` to your `env` key in `claude_desktop_config.json`". Example shows `"env": { "APPDATA": "C:\\Users\\user\\AppData\\Roaming\\", "BRAVE_API_KEY": "..." }`.

No `type`, `url`, `cwd` or `disabled` key appears on the MCP page. See Unverified.

## Path rules

Quoted (Troubleshooting):

> Make sure the file paths included in `claude_desktop_config.json` are valid and that they are absolute and not relative

Quoted (Windows):

> npm should be installed globally. The `npx` command may continue to fail if you have not installed npm globally. If npm is already installed globally, you will find `%APPDATA%\npm` exists on your system.

Restart rule, quoted (Step 4): "After saving the configuration file, completely quit Claude Desktop and restart it. The application needs to restart to load the new configuration and start the MCP server."

## Logs (for diagnosis; not parsed)

Quoted: "`mcp.log` will contain general logging about MCP connections and connection failures." and "Files named `mcp-server-SERVERNAME.log` will contain the stderr output from the named server."

## Remote connectors are a different mechanism

Quoted (connectors article, remote MCP section):

> Local MCP servers configured in Claude Desktop via `claude_desktop_config.json` are a separate mechanism and do use your local network. They aren't available in claude.ai or in Cowork sessions that run in the cloud; a Cowork session running locally on your device can use them.

Remote servers are added under Customize > Connectors, not in this file. A
remote-URL entry in `mcpServers` is not documented by either page.

## Staleness risk: HIGH

The Desktop app and its config keys change faster than the MCP docs page.
The Windows `%APPDATA%` and `npx` notes are troubleshooting prose, not a
schema.

## Unverified

- **MSIX path:** `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude` (Windows Store / MSIX install). Only seen in a GitHub issue; not on an official page. Do not add it as a lookup path.
- **`type` and `url` entries in `claude_desktop_config.json`:** not documented on either official page. Do not require or reject them. Remote servers are documented only through Connectors.
- **Unknown top-level keys such as `preferences`:** not documented on the official pages I read. A linter must not reject unknown top-level keys. Treat them as allowed.
- **Extension install location** `Claude Extensions/<id>/manifest.json` (third-party source only). See `claude-desktop-extensions.md`.
- **Whether Desktop writes `mcpServers` entries itself when an extension is installed:** the MCPB spec says "apps will automatically generate" them, but does not name Claude Desktop as doing so.
- **Config file encoding, comments and trailing commas:** the docs say to check "syntax" only. No parser rule is quoted.
