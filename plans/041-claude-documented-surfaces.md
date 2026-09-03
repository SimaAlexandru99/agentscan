# Plan 041: Remaining documented Claude surfaces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git rev-parse --short HEAD` then
> `git diff --stat 509aa6c..HEAD -- src/discover src/facts src/checks/mcp.ts docs/spec README.md`
> If those files changed since `509aa6c` in ways this plan does not describe,
> compare before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (local MCP lives in the same mixed `~/.claude.json` as
  session state; plugin agent frontmatter hooks are ignored by Claude and
  must not become findings)
- **Depends on**: plan 040 (DONE on this branch at `e68f90e`)
- **Category**: discovery
- **Planned at**: commit `509aa6c`, 2026-09-03

## Why this matters

Plan 040 opened user hooks and top-level user MCP under `--global`. Official
pages still name more files a scan never opens: local-scope MCP under
`projects.<path>.mcpServers`, user subagents, user `CLAUDE.md` / rules,
project (and user) `.claude/commands/*.md`, and in-tree plugin `skills/`,
`agents/`, root `SKILL.md`, `commands/`, and `.mcp.json`. A missing script
or `url` without `type` in any of those is the same silent failure the
tool exists for.

This is discovery only. Existing Claude / shared MCP / hook / skill / agent
/ memory checks apply once the facts exist. No new check ids.

## Current state

`--global` already opens `~/.claude/skills`, `~/.claude/settings.json`, and
top-level `~/.claude.json` `mcpServers`. Project walk-up covers
`.claude/agents`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules`.
In-tree plugins contribute `hooks/hooks.json` only.

`parseClaudeUserJsonMcp` / `parseClaudePluginMcpFile` and
`claudeConfigDir()` / `normalizeClaudeProjectKey()` are already in the
tree (uncommitted start of this plan). Finish them; do not parse the raw
`~/.claude.json` root as a server map.

## Spec lines (read 2026-09-03)

Do not invent paths. Quote only these pages (already in `SPEC_SURFACES`
except plugins, which `hook-sources.md` already cites):

**MCP** (`https://code.claude.com/docs/en/mcp`):

> Local scope … stored in `~/.claude.json` under that project's path
>
> ```json
> { "projects": { "/path/to/your/project": { "mcpServers": { "stripe": { "type": "http", "url": "…" } } } } }
> ```
>
> Your configuration directory, `~/.claude` unless you set `CLAUDE_CONFIG_DIR`

**Memory** (`https://code.claude.com/docs/en/memory`):

> User instructions | `~/.claude/CLAUDE.md`
> Personal rules in `~/.claude/rules/` apply to every project

**Subagents** (`https://code.claude.com/docs/en/sub-agents`):

> User subagents (`~/.claude/agents/`) are personal subagents available in
> all your projects.
> Claude Code scans `.claude/agents/` and `~/.claude/agents/` recursively

**Skills** (`https://code.claude.com/docs/en/skills`):

> Custom commands have been merged into skills. A file at
> `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md`
> both create `/deploy`
> Files in `.claude/commands/` … You invoke a command file by its file name.

**Plugins** (`https://code.claude.com/docs/en/plugins`, already in hook-sources):

> `skills/` · `commands/` · `agents/` · `.mcp.json` at the plugin root
> A plugin that ships exactly one skill can place `SKILL.md` directly at
> the plugin root
> For security reasons, plugin subagents don't support the `hooks`,
> `mcpServers`, or `permissionMode` frontmatter fields.

**Directory explorer** (corroboration only; do not add a new
`spec-surfaces` URL): `commands/*.md` is Project and global. Every
`~/.claude` path relocates under `CLAUDE_CONFIG_DIR`. `~/.claude.json`
is listed separately as a home-directory file.

## Scope

**In scope**

- Local `projects.<abs-path>.mcpServers` in `~/.claude.json` under
  `--global`, only for keys that normalize-equal the scanned `root`,
  `startDir`, or `scanBoundary`. Same-name user + local + project facts
  all stay. `claudeMcpLayer` distinguishes user vs local so `mcpKey` and
  finding subjects do not collide.
- `CLAUDE_CONFIG_DIR` relocates `~/.claude/*` (settings, skills, agents,
  `CLAUDE.md`, rules, commands). `~/.claude.json` stays
  `join(homedir(), ".claude.json")`.
- `--global` user `agents/`, `CLAUDE.md`, `rules/`, `commands/`.
- Walk-up project `.claude/commands/*.md` as `SlashCommandFact`
  (`sourceProvider: "claude"`). Frontmatter hooks use `source: "skill"`.
- In-tree plugin (already found via `.claude-plugin/plugin.json` or
  `hooks/hooks.json`): `skills/`, root `SKILL.md`, `agents/` (no
  frontmatter hooks), `commands/`, `.mcp.json` as `claude-json`.
- Tests, spec/README/CHANGELOG Unreleased, this plan's status row.

**Out of scope**

- Managed policy, MDM, `managed-settings.json`
- Marketplace `~/.claude/plugins`
- Other projects' `projects.*.mcpServers`
- `auth.json`, session / OAuth keys, auto-memory under
  `~/.claude/projects`, transcripts
- Plugin `workflows/`, output-styles, agent-memory, keybindings, themes
- Putting `~/.claude.json` on `defaultConfig.mcpPaths`
- New check ids, version 1.5.0, `spec:record` of Codex/Gemini drift
- Executing command or workflow files

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | exit 0; new cases pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec drift | `bun run spec:check` | Claude pages still match; known Codex/Gemini hash drift is not this plan |
| Version | `node dist/cli.js --version` | `1.4.0` |

## Steps

### Step 1: Finish MCP identity

- `mcpSubject` / `mcpKey` include `claudeMcpLayer` (and existing platform).
- `discoverClaudeUserMcp(errors, [root, startDir, scanBoundary])`.
- Do not early-return when top-level `mcpServers` is absent if a matching
  local block exists.
- Never pass the raw `~/.claude.json` root to `parseMcpFile`.

### Step 2: `CLAUDE_CONFIG_DIR` + user surfaces

Replace `join(homedir(), ".claude", …)` with `claudeConfigDir()` for
settings, skills, agents, `CLAUDE.md`, rules, commands. Keep
`~/.claude.json` on `homedir()`.

### Step 3: Commands and in-tree plugins

Walk-up `.claude/commands`. Under `--global`, also
`join(claudeConfigDir(), "commands")`. Flatten command-file hooks into
`allHooks`. Discover plugin extras from existing plugin roots. Plugin
agent frontmatter hooks stay unread.

### Step 4: Tests

New file `tests/unit/claude-surfaces.test.ts` (keep `claude-global.test.ts`
green). Required cases:

1. Local MCP `--global` only; matching project key loads; `claudeMcpLayer === "local"`.
2. Other-project `projects` key is ignored (no invented servers).
3. Same name at user + local + `.mcp.json` — three facts.
4. User+local same name both emit `claude.mcp.url-without-type` (subjects differ).
5. Non-MCP sibling values never leak from a local-only file.
6. User agents / `CLAUDE.md` / rules / commands are `--global` only.
7. Project `.claude/commands/ping.md` inventories without `--global`;
   frontmatter hook `source === "skill"`.
8. In-tree plugin: `skills/`, root `SKILL.md`, `agents/`, `commands/`,
   `.mcp.json` (`claude-json`). Plugin agent hooks do not appear.
9. `CLAUDE_CONFIG_DIR` relocates settings/skills; `~/.claude.json` stays
   under `homedir()`.
10. Without `--global`, none of the user/local home surfaces appear.

### Step 5: Docs and gates

Update `docs/spec/mcp.md`, `claude-memory.md`, `claude-subagents.md`,
`skills.md`, `hook-sources.md`, README matrix / `--global` / known
limits, CHANGELOG Unreleased. No new `SPEC_SURFACES` URL. Mark this
plan DONE only after gates pass.

## Done criteria

- [x] Local MCP only for matching scanned paths
- [x] `CLAUDE_CONFIG_DIR` does not relocate `~/.claude.json`
- [x] Plugin agent frontmatter hooks are not findings
- [x] Marketplace plugins and managed policy stay unread
- [x] No new check id; version stays 1.4.0
- [x] `defaultConfig.mcpPaths` unchanged
- [x] `bun test`, `typecheck`, `build` exit 0

## STOP conditions

- Live pages no longer list local `projects.*.mcpServers`, user agents,
  user `CLAUDE.md` / rules, `.claude/commands/`, or in-tree plugin
  `skills/` / `agents/` / `.mcp.json`.
- Opening `~/.claude.json` would require storing or reporting non-MCP
  top-level fields.
- A new **error** check seems necessary.
- The change would write to the scanned tree or open a network socket on
  `check`.
- `git diff master -- src/config/schema.ts` would add `~/.claude.json`
  to `mcpPaths`.

## Maintenance notes

- Reviewers: matching `projects` keys is the defect to watch. Inventorying
  every project's local servers would leak other trees' MCP into this scan.
- Plugin agent hooks are ignored by Claude; extracting them is a false
  `claude.hook.missing-script`.
- `spec:check` Codex/Gemini drift on 2026-09-02 is unrelated; do not
  `spec:record` those pages here.
