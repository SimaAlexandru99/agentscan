# Claude Desktop extensions (MCPB manifest.json)

**Source:** https://raw.githubusercontent.com/anthropics/mcpb/main/MANIFEST.md
**Read:** 2026-11-14
**Depends on it:** `claude-desktop.extension.missing-field`

## Files

| Scope | Path | Opened by agentscan: planned |
|-------|------|------------------------------|
| Extension package | `manifest.json` at the package root | planned |
| Installed extension | `Claude Extensions/<id>/manifest.json` | unverified, see below; not opened |

The spec's example layout puts `manifest.json` at the root of the package,
beside `server/`:

> ├── manifest.json       # server.type = "uv"

Quoted, spec header: "Current version: `0.3`" and "Last updated: 2025-12-02".

## Required fields

Quoted (Required Fields):

- `manifest_version`: "Specification version this extension conforms to"
- `name`: "Machine-readable name (used for CLI, APIs)"
- `version`: "Semantic version (semver)"
- `description`: "Brief description. This field is localizable."
- `author`: "Author information object with name (required, localizable), email (optional), and url (optional)"
- `server`: "Server configuration object"

The minimal example uses `"manifest_version": "0.3"`, and its `author` object
is `{ "name": "Extension Author" }`.

## server

Quoted: "The `server` object defines how to run the MCP server" with "Four server types are supported":

- `node`: "Node.js server with bundled dependencies"
- `python`: "Python server with bundled dependencies"
- `binary`: "Compiled executable"
- `uv`: "Python server using UV runtime (v0.4+)"

Keys seen in examples: `type`, `entry_point` (for example `"server/index.js"`),
and `mcp_config` with `command`, `args`, and `env`. `${__dirname}` is
"replaced with the extension's directory".

`uv` examples use `"manifest_version": "0.4"`, while the header says current
version `0.3`. The spec does not reconcile these. Treat `manifest_version`
as a string and accept `0.3` and `0.4`. Do not hard-fail on either.

## mcp_config

Quoted: "The `mcp_config` object in the server configuration defines how the implementing app should execute the MCP server. This replaces the manual JSON configuration users currently need to write."

Quoted: "When installing the extension, apps will automatically generate the appropriate MCP server configuration and add it to the user's settings, eliminating the need for manual JSON editing."

So an extension's `mcp_config` is the source for a generated `mcpServers`
entry. It is not a separate file. The spec does not name Claude Desktop
for this behavior.

## Optional fields used by agentscan checks

- `compatibility.claude_desktop`: "Minimum Claude Desktop version required (uses semver)"
- `repository`: "Source code repository information (type and url)"
- `user_config`: user-supplied options, each with `type`, `required` (default false)
- `privacy_policies`: "Required when the extension connects to external services"

## Staleness risk: HIGH

The spec file has a "Last updated" date of 2025-12-02, and its example
versions are already ahead of its header. Re-read before tying any rule to a
version number.

## Unverified

- **Install location `Claude Extensions/<id>/manifest.json`:** not in the MANIFEST.md. Third-party source only. Do not open it.
- **Whether Claude Desktop reads `manifest.json` from disk or only from the `.mcpb` archive:** the spec does not say.
- **Whether Claude Desktop honors the `mcp_config` override and `user_config` values:** the spec is written for "implementing app" in general.
- **Unknown top-level manifest keys such as `preferences`:** not in the spec. A linter must not reject unknown top-level keys.

## Observed on a real install (2026-11-14)

A Windows Claude Desktop install had `%APPDATA%\Claude\Claude Extensions\<id>\manifest.json`
with `manifest_version` "0.2", `server.type` "node" and every required field.
Another installed extension directory had no `manifest.json`; agentscan skips
such a directory. Because the install path is still not in Anthropic's docs,
`claude-desktop.extension.missing-field` is a **warning**, and `dxt_version`
(the pre-rename field) counts as `manifest_version`.
