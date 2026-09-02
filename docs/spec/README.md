# Spec knowledge base

Every check in agentscan encodes an assumption about how agent configuration
works. When those assumptions come from reading real projects instead of from a
published spec, the tool reports confident falsehoods — that has happened twice
in this repo and cost 25 of 37 findings.

This directory is the antidote. Each file records what a spec actually says, the
URL it says it at, the date it was read, and which check depends on it.

## The rule

**A check is written against a published spec line, never against what happens
to appear in real projects.** When adding a check:

1. Find the spec statement it enforces.
2. Record it here with its URL and the date.
3. Cite that file from a comment beside the code.
4. If no spec statement exists, the check is a heuristic — say so in its
   `reason`, and prefer `info` severity.

## Files

| File | Covers | Checks that depend on it |
|------|--------|--------------------------|
| [check-inventory.md](check-inventory.md) | All 99 checks re-read against their source pages on 2026-09-02; per-check verdict; the 7 false positives corrected | audit record for every id |
| [hook-events.md](hook-events.md) | The 33 dispatched Claude hook event names; required `type`; command/http/mcp_tool/prompt fields; event/handler compatibility | `claude.hook.unknown-event`, `claude.hook.unknown-handler-type`, `claude.hook.command-without-command`, `claude.hook.http-without-url`, `claude.hook.mcp-tool-without-server-or-tool`, `claude.hook.prompt-without-prompt`, `claude.hook.incompatible-handler` |
| [hook-sources.md](hook-sources.md) | Where a hook can be registered and how script paths resolve | `claude.hook.missing-script`, `claude.hook.unknown-event` |
| [skills.md](skills.md) | Claude Code SKILL.md frontmatter; first-paragraph fallback; listing budget | `claude.skill.missing-frontmatter`, `claude.skill.missing-description`, `skill.description-budget` |
| [agent-skills.md](agent-skills.md) | Portable Agent Skills required and optional constrained fields | `agent-skills.skill.*` |
| [agents.md](agents.md) | Claude subagent frontmatter; letters-and-hyphens names; filename is not compared | every `claude.agent.*` check |
| [mcp.md](mcp.md) | Claude MCP shape and transports; reserved names; `.mcp.json` is shared | `claude.mcp.no-launch`, `claude.mcp.url-without-type`, `claude.mcp.reserved-name`, `mcp.command-missing` |
| [commandcode-mcp.md](commandcode-mcp.md) | Command Code `transport` / `type` alias; shared `.mcp.json` | `commandcode.mcp.*` |
| [commandcode-settings.md](commandcode-settings.md) | Settings layers, inline `mcp.servers`, files never to read | discovery |
| [commandcode-hooks.md](commandcode-hooks.md) | Four events, command handlers, timeout 0–600 | `commandcode.hook.*` |
| [commandcode-skills.md](commandcode-skills.md) | `.commandcode/skills`, `.agents` compatibility, extra locations | `agent-skills.skill.*` |
| [commandcode-agents.md](commandcode-agents.md) | Filename name fallback, reserved names, field types | `commandcode.agent.*` |
| [commandcode-memory.md](commandcode-memory.md) | Per directory `AGENTS.md` else `.commandcode/AGENTS.md`; `@path` is not a hard error | discovery |
| [commandcode-commands.md](commandcode-commands.md) | `.commandcode/commands` inventory | none |
| [commandcode-mods.md](commandcode-mods.md) | Mods inventory-only; never execute | none |
| [vscode-mcp.md](vscode-mcp.md) | VS Code `.vscode/mcp.json` `servers` wrapper | `vscode.mcp.no-launch` |
| [cursor-mcp.md](cursor-mcp.md) | Cursor `.cursor/mcp.json` | `cursor.mcp.no-launch` |
| [antigravity-mcp.md](antigravity-mcp.md) | Antigravity `serverUrl` | `antigravity.mcp.no-launch` |
| [codex-mcp.md](codex-mcp.md) | Codex `[mcp_servers.*]` TOML; user file under `--global` | `codex.mcp.no-launch` |
| [thresholds.md](thresholds.md) | Every numeric threshold and its evidence | all `budget.*`, `skill.description-budget`, `codex.budget.instructions`, `cursor.rule.too-large`, `agent-skills.skill.body-too-large` |
| [agents-md.md](agents-md.md) | Portable AGENTS.md — no required fields, nested nearest-wins | discovery; `budget.agents-md` stays heuristic |
| [claude-memory.md](claude-memory.md) | Walk-up `CLAUDE.md` / `.claude/CLAUDE.md` and `.claude/rules` | `budget.claude-md` |
| [claude-subagents.md](claude-subagents.md) | Walk-up `.claude/agents`; duplicates per directory | `claude.agent.duplicate-name` scope |
| [codex-agents-md.md](codex-agents-md.md) | Codex chain knobs and 32 KiB cap | `codex.budget.instructions` |
| [vscode-instructions.md](vscode-instructions.md) | `.github/copilot-instructions.md` and `*.instructions.md` | discovery only |
| [vscode-agents.md](vscode-agents.md) | `.github/agents`; name defaults to filename | do not emit `claude.agent.*` |
| [vscode-hooks.md](vscode-hooks.md) | Native VS Code `.github/hooks/*.json`, eight events, command-only | `vscode.hook.*` |
| [copilot-hooks.md](copilot-hooks.md) | Copilot CLI `version: 1` files; camelCase events; bash/powershell | `copilot.hook.*` |
| [cursor-rules.md](cursor-rules.md) | `.cursor/rules/**/*.mdc` under 500 lines | `cursor.rule.too-large` |
| [gemini-mcp.md](gemini-mcp.md) | `.gemini/settings.json` launch fields; underscore alias warning | `gemini.mcp.no-launch`, `gemini.mcp.underscore-alias` |
| [opencode-mcp.md](opencode-mcp.md) | `opencode.json(c)` V1 vs V2; command must be an array | `opencode.mcp.*` |
| [continue-mcp.md](continue-mcp.md) | `.continue/config.yaml` and standalone YAML block metadata | `continue.mcp.no-launch`, `continue.mcp.missing-block-metadata` |
| [cursor-skills.md](cursor-skills.md) | Nested `.cursor/skills` / `.agents/skills` Agent Skills contract | `agent-skills.skill.*` |
| [codex-skills.md](codex-skills.md) | Codex `.codex/skills` Agent Skills contract | `agent-skills.skill.*` |
| [grok-mcp.md](grok-mcp.md) | Grok `[mcp_servers.*]` TOML; project walk-up; user under `--global` | `grok.mcp.no-launch` |
| [grok-hooks.md](grok-hooks.md) | 14 events; command/http; `.grok/hooks/*.json` | `grok.hook.*` |
| [grok-skills.md](grok-skills.md) | `.grok/skills`; optional name/description; frontmatter required | `grok.skill.missing-frontmatter` |
| [grok-rules.md](grok-rules.md) | `.grok/rules/*.md`; `Agents.md` / `AGENT.md`; no size cap | discovery |
| [grok-agents.md](grok-agents.md) | `.grok/agents/` location only; no filename pattern | unread |
| [windsurf-rules.md](windsurf-rules.md) | `.devin/rules` + `.windsurf/rules` + `global_rules.md`; 12k / 6k characters | `windsurf.rule.*` |
| [windsurf-agents-md.md](windsurf-agents-md.md) | `AGENTS.md` / `agents.md`; root always-on, subdirectory auto-glob | discovery |
| [windsurf-mcp.md](windsurf-mcp.md) | `~/.codeium/windsurf/mcp_config.json` under `--global`; `command` / `serverUrl` / `url` | `windsurf.mcp.no-launch` |

Each `STRUCTURAL_CHECKS` entry also carries `provenance` (`spec-required`,
`vendor-recommendation`, `security`, `internal-consistency`, or `heuristic`)
so the registry can tell a published requirement from a size opinion.

## What is not spec-backed

Some checks assert internal consistency rather than conformance to a spec:
`claude.hook.missing-script`, `mcp.command-missing`, `skill.broken-reference`,
`skill.locked-not-installed`, `skill.missing-skill-md`, `config.unreadable`.
Each compares two things this repo can both observe — a config entry and the
filesystem.

These are **heuristics** (installer policy or size opinions) and stay at `info`:
`skill.not-in-lock`, `skill.no-lockfile`, `skill.duplicate-description`,
`budget.agents-md`, `budget.agents`, `budget.mcp`.

`skill.description-budget` is a **vendor-recommendation** (1% context window,
8000-character fallback, 1536 per-entry cap), not a heuristic 16000-byte guess.

`scan.truncated` is not about the scanned project at all: it reports a limit of
this scanner, so that a check reading a bounded prefix of a file never looks
like a check that read all of it.

## Re-verification

```bash
bun run spec:check     # compare against the live pages; exit 1 on drift
bun run spec:record    # after re-reading: rewrite scripts/spec-hashes.json
```

`spec:check` does three things against the live pages. It diffs the hardcoded
Claude, VS Code, Copilot CLI, Command Code, and Grok hook-event sets against
the pages that define them. It checks `scripts/spec-surfaces.ts` lastVerified
dates and warns when the newest capture here is over 90 days old. And, for
every unique URL in `SPEC_SURFACES`, it reduces the page to prose, hashes it,
and compares against the baseline in `scripts/spec-hashes.json`; a changed
hash is reported as drift with the recorded date and the URL. The page text is
never stored — only a 16-hex hash — so nothing here redistributes vendor
documentation.

The hash comparison is what the 2026-09-02 re-verification was missing: the
event diff covers five pages, and a date check cannot see a vendor adding an
alias, a field, or a spelling to any of the other thirty. A changed hash does
not say what changed; it says open this URL and re-read the capture. Do that,
update `docs/spec/<file>.md` and the conformance fixture with any new official
example, then run `spec:record`. Recording without reading turns the detector
back into silence.

It makes network calls, so it is a release-time script (and a weekly job in
`.github/workflows/spec-drift.yml`) and is never reached from `agentscan check`
— the scan path touches no network and that is worth more than automatic
freshness. It over-reports by design; adjudicated false alarms in the event
diff go in `REVIEWED_NOT_EVENTS`, and a hash that moved for a cosmetic reason
still costs one read.

The other half of the defence is `tests/fixtures/conformance/`: every fixture
carries the vendor's own examples verbatim and must scan clean, and the
conformance test pins a minimum fact count per fixture so discovery cannot
silently skip one. A line that was on the page and missed at capture — which a
hash can never detect — shows up there the moment the example is copied in.

Anything in here can go stale. The list most likely to is
[hook-events.md](hook-events.md) — it already lagged by 22 names once. Re-read
the sources when a user reports a false positive on a value they believe is
valid, and when cutting a release.

The last full re-read was 2026-09-02 ([check-inventory.md](check-inventory.md)):
93 of 99 checks held, and 6 had drifted into reporting a documented shape as
broken — an alias (`streamable-http`), a tolerated transport (`sse`), a wider
character class (Unicode skill names), a new field (`exec`), new spellings
(PascalCase Copilot events), an interpolation form (`%VAR%`), and a default
value (`inherit`). Each is a line the 2026-08-31 captures did not hold; the
pages do not say whether it was added after that date or was there and
missed. Either way the failure was the one this file predicts — a valid
shape reported as broken — and at the time `spec:check` only compared
hook-event names against the live pages, so none of the seven could have been
caught by it. Plan 038 added the per-page content hash and the verbatim
fixtures for that reason.
