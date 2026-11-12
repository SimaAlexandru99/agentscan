# VS Code / Copilot MCP

**Source:** https://code.visualstudio.com/docs/agents/reference/mcp-configuration
**Read:** 2026-11-12
**Depends on it:** `vscode.mcp.no-launch`, `mcp.command-missing`, `security.hardcoded-secret`, `mcp.literal-env`

## Two formats

Quoted (2026-11-12):

- VS Code format: `.vscode/mcp.json`, top-level `servers`. The Copilot harness
  does not read this file directly. VS Code forwards eligible servers.
  `servers` stays the key. Do not read `mcpServers` out of this file.
- Portable Copilot format: workspace-root `.mcp.json` and user
  `$COPILOT_HOME/mcp-config.json` (fallback `~/.copilot/mcp-config.json`),
  top-level `mcpServers`. Copilot reads the portable format directly.

Workspace `.mcp.json` stays the shared `mcp-json` profile (Claude and
Command Code). It is not given `consumedBy: vscode`, so `vscode.mcp.no-launch`
does not fire on a Claude `.mcp.json`. The user file is `copilot-json`,
opened under `--global` only, and shares `vscode.mcp.no-launch`. Launch is
`command` or `url`. Claude `url-without-type` does not apply.

## Project file

`.vscode/mcp.json`. Top-level key is `servers`, not `mcpServers`. Official example:

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
existence check rather than invent a path. An OS-specific launch that does not
match `process.platform` is inventoried but not existence-checked — Windows
`.\scripts\server.js` / UNC script paths on Linux, and POSIX `/home/…` paths
on Windows, do not emit `mcp.command-missing`. Host-matching overrides and
platform-neutral launches stay fully checked. Windows drive and UNC cwd
values are not joined as relative POSIX paths when the scanner is running on
Linux or macOS.

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
