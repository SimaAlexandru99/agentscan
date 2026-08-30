# Plan 025: Parse MCP configs per provider schema

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/discover/mcp.ts src/checks/mcp.ts src/config/schema.ts src/facts/types.ts`

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/021-spec-captures-and-provenance.md, plans/022-provider-identity-on-facts.md
- **Category**: bug
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

`parseMcpServers` accepts `mcpServers` or a bare map of `{command|url|type}`
objects and **rejects** a `servers` wrapper (the VS Code spelling). Defaults
omit `.vscode/mcp.json`. Launch is `command` or `url` only, so Antigravity
`serverUrl` and Codex TOML are invisible. A VS Code project with broken MCP
can get zero findings. Applying `mcp.url-without-type` to Codex would be a
false positive.

## Current state

- Defaults: `mcpPaths: [".mcp.json", ".claude/mcp.json", "mcp.json"]` (`src/config/schema.ts:16`)
- Rejection comment: `src/discover/mcp.ts:97-100`
- Launch check: `src/checks/mcp.ts:30` `hasCommand || hasUrl`
- `url` without `type`: `src/checks/mcp.ts:70` — Claude-only rule, currently applied to every fact
- No TOML, no `serverUrl`, no JSONC

## Path → profile (locked)

| Path | Profile | Wrapper | Launch | `url` without `type` |
|------|---------|---------|--------|----------------------|
| `.mcp.json`, `.claude/mcp.json`, `mcp.json` | `claude-json` | `mcpServers` or bare server map | `command` or `url` | **yes**, emit `claude.mcp.url-without-type` |
| `.vscode/mcp.json` | `vscode-json` | `servers` | `command` or `url` | no (stdio example omits url; remote example includes `type`) |
| `.cursor/mcp.json` | `cursor-json` | `mcpServers` | `command` or `url` | **no** — remote docs example has `url` only |
| `.agents/mcp_config.json` | `antigravity-json` | `mcpServers` | `command` or `serverUrl` | n/a — `url` is not launch |
| `.codex/config.toml` | `codex-toml` | `[mcp_servers.<name>]` | `command` or `url` | **no** |

If `docs/spec/codex-mcp.md` was not written in 021, skip the Codex row and mark this profile BLOCKED.

Detect profile from **relative path**, not by sniffing a universal object. A file at `.agents/mcp_config.json` is Antigravity even though the key is `mcpServers`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope**: `src/discover/mcp.ts` (split into profile helpers if the file grows), `src/checks/mcp.ts`, `src/facts/types.ts` (`McpFact`), `src/config/schema.ts` defaults, new deps `smol-toml` (or equivalent small Node TOML parser) and a JSONC parse path, tests, spec citations.

**Out of scope**: `includeGlobal` home MCP files; Kilo/OpenCode/Continue (033); spawning servers.

## Steps

### Step 1: Extend McpFact

Add `schemaProfile: string`, `hasServerUrl?: boolean`, `sourceProvider?: Provider`. Keep `command?: string`. If `command` is an array, set `hasCommand` true and path-check the first element when it is a string path. Store `raw` as JSON text of the entry (never log secrets).

### Step 2: Parsers

- JSONC for `.vscode/mcp.json`: comments must not become `config.unreadable`. A tiny strip-comments + `JSON.parse` is acceptable if it does not invent values. Do not execute `${input:...}`.
- TOML: parse `.codex/config.toml`, read only `mcp_servers` table. Other keys ignored.
- `readJsonConfig` may stay strict JSON for Claude paths; VS Code uses the JSONC reader.

### Step 3: Checks

- Launch: profile-specific. Claude/VS Code/Cursor: `hasCommand || hasUrl`. Antigravity: `hasCommand || hasServerUrl`. Codex: `hasCommand || hasUrl`.
- IDs for 0.8.0: keep emitting `mcp.no-launch` for Claude-like profiles **or** emit `claude.mcp.no-launch` if 026 has not landed yet. Prefer adding `antigravity.mcp.no-launch` (message mentions `serverUrl`) now. 026 will namespace Claude IDs; if you namespace MCP Claude IDs here, update the alias map the same way 026 describes.
- `mcp.url-without-type` **only** when `schemaProfile === "claude-json"`.
- `mcp.command-missing` unchanged discipline (no PATH search).
- `mcp.hardcoded-secret`: scan `raw` including headers, oauth/auth, args, urls. Do not flag `${VAR}`, `${env:NAME}`, `${input:ID}`.
- `mcp.literal-env`: keep key-name gate; **fix the reason/message** (it is not “long” literals). Treat Cursor `${env:NAME}` as interpolation, not a literal.

### Step 4: Defaults

Add to `mcpPaths`: `.vscode/mcp.json`, `.cursor/mcp.json`, `.agents/mcp_config.json`, `.codex/config.toml`.

### Step 5: Tests

Official-shaped fixtures → **zero** findings:
- VS Code `{ "servers": { "playwright": { "command": "npx", "args": ["-y", "x"] } } }`
- Antigravity `{ "mcpServers": { "r": { "serverUrl": "https://example.com/mcp/" } } }` — use example.com, no real tokens
- Cursor `{ "mcpServers": { "r": { "url": "http://localhost:3000/mcp" } } }` — no `url-without-type`
- Codex TOML `[mcp_servers.docs]\nurl = "https://example.com/mcp"` — no `url-without-type`

Broken cases:
- VS Code file not scanned before → now yields `mcp.no-launch` if an entry has neither command nor url
- Antigravity entry with only `url` (no `serverUrl`, no `command`) → no-launch
- JSONC comment in `.vscode/mcp.json` is readable

Never put real credentials in fixtures. Use `sk-ant-` + 16+ `x` if you need the secret pattern.

**Verify**: `bun test` and `bun run typecheck`

## Done criteria

- [ ] Default paths include the four new files
- [ ] VS Code `servers` is parsed
- [ ] Antigravity `serverUrl` is launch
- [ ] Codex/Cursor `url` without `type` is not a finding
- [ ] `bun test`, `bun run typecheck`, `bun run build`, `bun run spec:check` exit 0
- [ ] Scan path still has no `fetch` / sockets

## STOP conditions

- Official Cursor/Codex page contradicts the table — recapture.
- Codex spec file missing — skip TOML, do not guess `[mcp_servers]`.
- A TOML parser that only works under Bun (published `dist/cli.js` targets Node).

## Maintenance notes

033 adds more profiles the same way: path → parser → launch fields. Do not merge them into `parseMcpServers`.
