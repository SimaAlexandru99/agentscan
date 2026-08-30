# VS Code / Copilot MCP

**Source:** https://code.visualstudio.com/docs/copilot/customization/mcp-servers
**Read:** 2026-08-30
**Depends on it:** `vscode.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

## Project file

Workspace MCP lives at `.vscode/mcp.json` (also a user-profile `mcp.json`
outside the project — unread unless `--global` is later specified).

## Shape

Top-level key is `servers`, not `mcpServers`. Official example:

```json
{
  "servers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp"
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@microsoft/mcp-server-playwright"]
    }
  }
}
```

Launch is `command` (stdio) or `url` (remote). Optional `cwd` and OS overrides
(`windows` / `linux` / `osx`) are honoured when path-checking a script.
Unresolved interpolations in `cwd` (`${workspaceFolder}`, `${env:…}`) skip the
existence check rather than invent a path. Windows drive and UNC cwd values
(`C:\…`, `\\server\share`) are not joined as relative POSIX paths when the
scanner is running on Linux or macOS — those existence checks are skipped.

The docs tell authors to avoid
hardcoding secrets and to use input variables (`${input:...}`) or environment
files. `${input:...}` is interpolation, not a literal secret.

`uses:` is not a VS Code launch field.

The file is often JSONC (comments). A comment must not make the scan report
`config.unreadable`.

## What this tool does not claim

Claude's `url` without `type` skip behaviour is **not** documented on this
page. Do not emit `claude.mcp.url-without-type` for `vscode-json`.

## Staleness risk: HIGH
