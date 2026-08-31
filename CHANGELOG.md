# Changelog

Notable changes to `@chimix/agentscan`. Dates are UTC publish days from git
and the existing GitHub releases. The `check` path stays offline and
read-only in every version below.

GitHub already has release pages for [v0.1.0](https://github.com/SimaAlexandru99/agentscan/releases/tag/v0.1.0)
and [v0.4.0](https://github.com/SimaAlexandru99/agentscan/releases/tag/v0.4.0).
0.9.0 was planned as a separate train and shipped inside 1.0.0.
1.0.1 is the shared-MCP hotfix; it is documented below and ships inside 1.1.0
(the published package version). A separate 1.0.1 npm tag would need an
intermediate commit that this train does not cut.

## 1.2.0 — 2026-08-31

Native Grok Build provider against 2026-08-31 official docs. **95 checks**,
**435 tests**. Compatibility with Claude or Cursor is not schema identity.

### Added

- Spec captures `docs/spec/grok-mcp.md`, `grok-hooks.md`, `grok-skills.md`,
  `grok-rules.md`, `grok-agents.md`.
- Profiles: `grok-toml` MCP, `grok` hook and skill schemas.
  `inferHookSchemaProfile("grok")` is `"grok"`, not `"claude"`.
- Project `.grok/config.toml` walk-up (cwd → scan boundary). User
  `$GROK_HOME/config.toml` or `~/.grok/config.toml` under `--global`.
  Same-name project replaces user; closer project file wins.
  `grok.mcp.no-launch` when neither `command` nor `url` is set. Never
  `claude.mcp.url-without-type` on `grok-toml`.
- `.grok/hooks/*.json` and user hooks under `--global`. Fourteen events;
  handlers `command` / `http`. Copilot `version: 1` remap is not applied.
- `.grok/skills` (and user skills under `--global`). Frontmatter required;
  `name` / `description` optional. Agent Skills directory-match and Claude
  listing-budget checks do not run.
- `.grok/rules/*.md` with no size cap. `Agents.md` and `AGENT.md` as Grok
  instruction files beside `AGENTS.md`.
- Conformance fixture `tests/fixtures/conformance/grok-toml/`.
- `spec:check` drifts Grok hook event names against the live hooks page.

### Unread (intentional)

- Managed / requirements TOML, plugins, marketplaces, personas, LSP,
  `sandbox.toml`, `pager.toml`.
- `[skills] paths` (no quoted resolution base).
- `.grok/agents/` (directory named, no filename pattern).
- Claude / Cursor / `.mcp.json` as Grok-consumed.
- `.gitignore` skip for instruction files.
- Credential files (`auth.json`, `mcp_credentials.json`).

## 1.1.0 — 2026-08-31

Native Command Code provider, then a correctness pass over every registered
check against 2026-08-31 official docs. Includes 1.0.1. **87 checks**, **420
tests**.

### Added

- Hook schema profiles: `claude` | `vscode-native` | `copilot-cli` |
  `commandcode`. `.github/hooks` with `version: 1` is Copilot CLI.
- Claude hook schema: required `type` (not inferred from `command`/`url`);
  `mcp_tool` needs `server` + `tool`; `prompt`/`agent` need `prompt`;
  documented event/handler compatibility; nested matcher groups only.
- Copilot CLI: camelCase events mapped onto VS Code names; `bash` /
  `powershell` / `command`; `cwd`; `timeoutSec` then `timeout`. Prompt
  hooks only on `sessionStart`. User `~/.copilot/hooks` under `--global`.
- Agent Skills optional constrained fields: `compatibility` 1..500,
  `metadata` map<string,string>, `allowed-tools` string. Info for
  `SKILL.md` >500 lines. File references resolve from the skill root only.
- Claude skill listing budget: 1% context window, 8000-character fallback,
  per-entry cap 1536, listing text is description (or first markdown
  paragraph) plus `when_to_use`. First paragraph satisfies missing
  description.
- OpenCode V2: local `command` must be an argv array
  (`opencode.mcp.command-not-array`).
- Continue standalone YAML blocks require `name` / `version` / `schema`
  (`continue.mcp.missing-block-metadata`). Copied JSON is not checked.
- Gemini underscore alias warning (`gemini.mcp.underscore-alias`).
- Claude reserved MCP names including `workspace`
  (`claude.mcp.reserved-name`).
- Codex chain knobs: `AGENTS.override.md` > `AGENTS.md` >
  `project_doc_fallback_filenames`; one file per directory; root→cwd;
  `project_doc_max_bytes`; `project_root_markers`.
- Coverage matrix uses five dimensions (project discovery, global
  discovery, schema, precedence, conformance) instead of `full` /
  `partial`.
- Conformance fixture `tests/fixtures/conformance/copilot-hooks/`.
- Spec capture `docs/spec/copilot-hooks.md`. Alias
  `claude.hook.mcp-tool-without-name` →
  `claude.hook.mcp-tool-without-server-or-tool`.

### Changed

- Nested `<dir>/.commandcode/AGENTS.md` is Command Code memory when that
  directory has no `AGENTS.md` (official memory table).
- Native VS Code remains command-only with its documented eight events.
  `vscode.hook.http-without-url` and `vscode.hook.mcp-tool-without-name`
  are removed.
- Claude agent names: lowercase letters and hyphens (no digits); filename
  is not compared to `name`.
- `skill.description-budget` provenance is vendor-recommendation, not a
  16000-byte heuristic.

### Added (Command Code provider)

- Provider `commandcode` from official pages under `docs/spec/commandcode-*.md`
  (read 2026-08-31). Unknown stays skip: no invented local-project MCP slug,
  no bundled-skill scan, no `--skill` flags, no model-id list, no mods
  execution.
- Skills: `.commandcode/skills` only at the Command Code project root
  (Agent Skills contract), `.agents/skills` walk-up (max 10 hops from cwd,
  stopping at home), extra dirs from the highest-precedence settings
  `skills` array (replace, not merge; relative paths resolve against the git
  root). User `~/.commandcode/skills` and `~/.agents/skills` under
  `--global`.
- Memory: per directory, first existing of `AGENTS.md` or
  `.commandcode/AGENTS.md` (project and nested). User
  `~/.commandcode/AGENTS.md` under `--global`. Unresolved `@path` is not a
  hard error. Codex's instruction chain excludes `.commandcode/AGENTS.md`.
- Agents: `<project>/.commandcode/agents/*.md` at the Command Code project
  root only (git root, or cwd outside a git repo); filename supplies
  `name`; no `claude.agent.*` on these files. Checks:
  `commandcode.agent.reserved-name` (`explore` / `plan` / `review` /
  `general`), `invalid-permission-mode`, `invalid-field-type` covering every
  documented custom-agent typed field (`reasoningEffort` is not one of them).
  `maxTurns` must be a positive integer.
- Hooks: four events (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`);
  nested `hooks` array required; `type` must be the string `"command"`;
  `command` must be a string (not an argv array); `matcher` must be a string
  when present. Timeout 0–600. A matcher on `Stop` / `SessionStart` is
  runtime-dead, not a schema error. Project and user hooks for the same event
  coexist; only an exact duplicate command string is deduplicated (project
  wins). `settings.local.json` follows settings merge (an event array
  replaces the project array for that event). `COMMANDCODE_PROJECT_DIR` and
  `COMMANDCODE_CWD` expand against the Command Code project root.
- Settings: Command Code project root is the git root (a child `.cursor`
  does not hide `<git-root>/.commandcode/`). `model` inventoried, not
  validated. Inline `mcp.servers` (array or object map; unnamed array items
  are inventory-only). User `~/.commandcode/mcp.json` under `--global`.
  Spec/runtime checks skip shadowed lower-precedence definitions; security
  checks still inspect every readable MCP file.
- Slash commands: inventory `.commandcode/commands` at the project root and
  the user dir — no required-field checks.
- Mods: inventory `mods.paths` — never execute or import TypeScript.
- Conformance fixture `tests/fixtures/conformance/commandcode/`.
- `spec:check` tracks captured surfaces and diffs Claude, VS Code, Copilot
  CLI, and Command Code hook events against live pages.

### Also changed

- Default `skillPaths` includes `.commandcode/skills`.
- `--global` / `includeGlobal` also scans `~/.commandcode/skills`,
  `~/.agents/skills`, user Command Code agents, MCP, memory, Copilot user
  hooks, and Codex global AGENTS files.
- Shared `.mcp.json` is `mcp-json`, not Claude-only.

## 1.0.1 — 2026-08-31

Shared `.mcp.json` is not Claude-only. Command Code writes it for `--scope
project` with `transport` (and `type` as an alias). A Claude-keyed
`url`-without-`type` check on that path is a false positive on valid
Command Code HTTP config.

### Fixed

- `.mcp.json` uses schema profile `mcp-json`, `consumedBy: ["claude",
  "commandcode"]`, `sourceProvider: "unknown"`. `.claude/mcp.json` and
  project `mcp.json` stay `claude-json`.
- Parse `transport` first; `type` is an alias. Store which field was
  present.
- `claude.mcp.url-without-type` on `mcp-json` fires only when `url` is set
  and transport is unset. On `claude-json` it still fires when the field is
  `transport` or missing. `{ "transport": "http", "url": "…" }` does not
  emit this.
- Command Code transport defects on `mcp-json` and `commandcode-json`:
  `commandcode.mcp.invalid-transport`, `http-without-url`,
  `stdio-without-command`. Valid transports are `http` and `stdio`. Claude
  `sse` / `ws` on shared `.mcp.json` is not a Command Code invalid-transport.
- Empty launch on `mcp-json` still emits `claude.mcp.no-launch` (both
  consumers need a launch field). `commandcode-json` empty launch emits
  `commandcode.mcp.no-launch`.
- `looksLikeServerEntry` recognises `transport`. Absolute MCP paths under
  `--global` are not joined as relative.

### Security

- Never open `~/.commandcode/auth.json` or `mcp-tokens.json`.
- Local `~/.commandcode/projects/{project}/mcp.json` is unread: the slug
  encoding is unpublished. Prefer skip over inventing it.

## 1.0.0 — 2026-08-30

First stable release. 59 checks, 345 tests. The coverage matrix in the
README is the honesty contract: `full` only where discovery, spec-required
fields, and a conformance fixture (or equivalent tests) all exist.

### Added

- Portable Agent Skills required fields (`name`, `description`, directory
  match) for `.agents/skills`, nested Cursor `.cursor/skills`, and
  `.codex/skills`.
- Path-keyed MCP parsers: VS Code `servers`, Cursor, Antigravity
  `serverUrl`, Codex TOML, Gemini `command` / `url` / `httpUrl`, OpenCode
  V1 and V2, Continue `config.yaml` plus `.continue/mcpServers/*`.
- Nested / walk-up `AGENTS.md` with nearest-wins; Codex instruction budget
  uses the effective per-directory file and `project_doc_max_bytes`.
- Walk-up `.claude/agents`; VS Code `.github/agents` without Claude
  missing-name errors.
- VS Code `.github/hooks/*.json` (eight events) and per-provider hook
  event sets.
- Cursor `.cursor/rules/**/*.mdc` 500-line recommendation
  (`cursor.rule.too-large`, info). Claude rules are inventoried only.
- Official-shaped fixtures under `tests/fixtures/conformance/`.
- `spec:check` tracks 21 captured surfaces, not only Claude hook events.
- Launch `cwd` and `windows` / `linux` / `osx` overrides on hooks and MCP.
- GitHub Action pin `@v1`.

### Changed

- Product copy describes what 1.0.0 actually implements. Heuristics stay
  at `info` and are labeled in the registry.
- `--global` also scans `~/.codex/skills` under the Agent Skills contract.
- In a monorepo, each `skills-lock.json` governs only the skills under
  its directory (nearest lock wins).

### Fixed

- Nested `SKILL.md` trees are one skill, not a missing-md folder.
- Codex instruction chain: at most one file per directory; honour
  `project_doc_max_bytes`.
- Interpreter argv (`node script.js`), MCP `command` arrays, and OS
  overrides are path-checked. `--` inline code (`node -e`) is not a path.
- JSONC (comments and trailing commas) parses via `jsonc-parser`; the
  published bundle imports the ESM entry so Node can load `dist/cli.js`.
- Scan boundary stays at Git/workspace. A child `.cursor` does not hide
  parent Claude or Codex.
- `uses:` is a launch only on Continue. Other profiles treat a uses-only
  entry as non-launchable.
- OpenCode V2 requires `type` plus the matching launch field. V1
  enabled-only overrides that inherit externally do not emit a hard error.
- Windows drive / UNC cwd values and OS-specific script paths
  (`scripts\format.ps1`) are not joined as POSIX relative paths when the
  scanner runs on Linux or macOS. Those launches are inventoried;
  `scriptExists` / `commandExists` stay unset. Host-matching and
  platform-neutral launches stay fully checked. `C:foo` is unresolved,
  not absolute.
- Old 0.7 rule ids still work in `ignoreRules` and `explain`.

## 0.8.0 — 2026-08-30

Honesty pass after the multi-provider audit. 38 checks, 267 tests.

### Added

- Agent Skills profile on `.agents/skills` (required `name` /
  `description`).
- MCP profile parsers for VS Code `.vscode/mcp.json` (`servers`), Cursor
  `.cursor/mcp.json`, Antigravity `serverUrl`, and Codex
  `[mcp_servers.*]` TOML.
- Nearest-signal project root: a child `.cursor` / `.claude` wins over a
  parent `package.json`.
- Provenance on every registry entry (`spec-required`,
  `vendor-recommendation`, `security`, `internal-consistency`,
  `heuristic`).
- First coverage matrix (full / partial / none) for the surfaces this
  version actually implemented.

### Changed

- Claude check ids are namespaced (`claude.hook.missing-script`, …).
  `ignoreRules` and `explain` accept the old 0.7 ids as aliases.
- README no longer claims every check is spec-sourced or that there are
  no heuristics. Size opinions and installer policy stay at `info`.
- `budget.claude-md` quotes the official “target under 200 lines”
  recommendation instead of an unsourced 150–200 / 50-token story.

## 0.7.0 — 2026-08-24

27 checks, 250 tests.

### Added

- Hooks from in-tree plugin `hooks/hooks.json` and from skill / subagent
  frontmatter, not only the two settings files.
  `${CLAUDE_PLUGIN_ROOT}` expands only for a plugin-sourced hook.

### Changed

- `engines.bun` is `>=1.4.0`. The repo ships the text `bun.lock`
  (lockfileVersion 1); Bun 1.1 wrote `bun.lockb` and cannot read it, so
  the old `>=1.1.0` floor was false. `engines.node` stays `>=20.11.0`.
- CI pins Bun; `Bun.YAML` is rejected in favour of the `yaml` package.

## 0.6.0 — 2026-08-24

Stop reporting valid config as broken. 27 checks, 235 tests.

### Added

- `scan.truncated` (info): a file past the 64 KB skill or 100 KB policy
  cap is parsed from its prefix. The finding is about this scanner’s
  reach, not about the file being invalid.

### Changed

- `skill.duplicate-description` and `skill.description-budget` group by
  the directory that owns the skill, so two apps in a monorepo no longer
  look like a collision.
- `agent.invalid-name` drops from error to warning. The subagent
  reference specifies the name format but documents a load failure only
  for `:`.
- `--verbose` prints each finding’s id so the value `explain` and
  `ignoreFindings` take can be copied out of the report.

### Fixed

- A `SKILL.md` over the scan cap is no longer `config.unreadable` at
  error. Claude Code still loads that file; the frontmatter sits in the
  first 300 bytes.
- The Action’s `GITHUB_OUTPUT` heredoc delimiter is randomised.

Measured on the three projects that reproduced the defects: touchagency
0 → 34, kronstadt-ehs-2026 40 → 94, optimad 0 → 85.

## 0.5.0 — 2026-08-12

26 checks.

### Added

- `agentscan demo`: throwaway fixture with the killer missing-hook case,
  human report, then delete.
- Trees with agent config and no `package.json` are scannable.
- `mcp.command-missing`: path-like `command` values are compared to
  disk. Bare PATH binaries, shell compounds, and unresolved env vars
  are skipped.

### Changed

- Severity labels and neutral multi-event group headlines in the text
  report.
- Public check count synced to 26.

## 0.4.0 — 2026-08-09

Colour, a face, and a report that reads at a glance. 23 checks, 195
tests. [GitHub release](https://github.com/SimaAlexandru99/agentscan/releases/tag/v0.4.0).

### Added

- Terminal header with score, face, and bar. Piped output stays
  byte-identical to the uncoloured report. `--json`, `--output prompt`,
  and `--copy` are never coloured. `--no-color` and `NO_COLOR` are
  honoured.

### Changed

- The YAML rule engine is gone (709 lines, 9 info findings across 21
  projects, unused extension point). Its five rules are code, with
  byte-identical output.

## 0.3.0 — 2026-08-09

### Changed

- Repeated findings group: six dead hooks print one header with `×6`
  and one line per occurrence.
- Paths are shown relative to the scanned project.
- The score word (`broken`, …) comes from the same thresholds as the
  face and the colour, so they cannot disagree.

## 0.2.1 — 2026-08-09

### Changed

- Bare invocation (`npx @chimix/agentscan`) scans the current
  directory. The quick start shows findings instead of a usage screen.

## 0.2.0 — 2026-08-09

### Added

- Published `dist/cli.js` runs on Node 20.11+ as well as Bun. `npx
  @chimix/agentscan@latest` works without Bun installed. One bundled
  file, no install-time dependencies.

## 0.1.0 — 2026-08-09

First alpha. [GitHub release](https://github.com/SimaAlexandru99/agentscan/releases/tag/v0.1.0).
23 checks, each written against a published spec line in `docs/spec/`.

### Added

- Deterministic offline CLI: broken hooks, unlaunchable MCP, credentials
  pasted into config, skills that disagree with their lockfile.
- `check`, `--output prompt`, `--fail-on`, `--json`.
- Published score: `max(0, 100 - 10 × errors - 3 × warnings)`.
  Coverage-ratio scoring was built, measured, and rejected.
- Published as `@chimix/agentscan` — npm rejects the bare name as too
  close to an unrelated `agent-scan`. The command stays `agentscan`.

An earlier build reported 37 findings across 17 projects of which 25
were false, because two checks were written from observation. Both were
deleted before this release. Requires Bun for source development; `check`
never opens a socket and never writes the scanned tree.
