# agentscan check verification vs live vendor docs

**Date:** 2026-09-06  
**Last in-repo spec re-read:** 2026-09-03 (3 days earlier)  
**Question:** For each AI agent agentscan covers (and the ones it marks unread), do the live official docs still match the shipped checks for hooks, skills, agents, MCP, and instruction files?

Method: TinyFish search + fetch of vendor pages (ttl 0), then compare to `src/checks/registry.ts`, hook event sets, and the README coverage matrix. Two local inventory agents listed what the code actually asserts. Snippets were not treated as evidence; assertions below are from fetched page text.

Deduplicated to unique vendor/practice URLs after overlapping search results. Local inventory opened 48 repo files.

---

## Result

Shipped **spec-required checks still hold** on the pages they cite. Event enumerations for Claude (33), VS Code (8), Copilot CLI (camelCase + PascalCase + `userPromptTransformed`), Cursor (21 including `workspaceOpen`), Grok (14), Command Code (4), Gemini (11), and Windsurf (12) match the live tables.

The failure class is **silence, not false positives**: five ecosystems the matrix marks `none` now publish checkable schemas. Copilot and VS Code also document consuming Claude hook files, which agentscan still treats as Claude-only.

Do not raise those new surfaces to `error` until a capture quotes the line. That is the rule that already prevented the 25 false findings.

---

## Per-agent verdict

| Agent | Hooks | Skills | Agents | MCP / rules / instructions | Verdict |
|-------|-------|--------|--------|----------------------------|---------|
| **Claude Code** | 33 events; `type` required (`command`/`http`/`mcp_tool`/`prompt`/`agent`); nested groups | Frontmatter; `description` optional with first-paragraph fallback; listing 1536-char cap + 1% budget; 500-line rec | `name`+`description` required; lowercase+hyphens; filename not compared; `:` reserved | Reserved MCP names; `url` needs `type` (`streamable-http` alias); CLAUDE.md target &lt; 200 lines | **Holds** |
| **VS Code** | Still **eight** events; `type: command` only | n/a (customization is instructions/skills elsewhere) | `.agent.md` **frontmatter `hooks`** now documented | New [hooks reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference); workspace also loads `.claude/settings.json`; plugin `hooks.json`; `chat.hookFilesLocations` | **Events hold.** Gap: agent-scoped + plugin hooks unread |
| **Copilot CLI** | Table still includes `userPromptTransformed`; `exec`/`args`; prompt only on `sessionStart`; PascalCase aliases | n/a | n/a | Official page now: **inline hooks in `.claude/settings.json` are also read**. Policy `/etc/github-copilot/policy.d` still unread (by design) | **Schema holds.** Honesty gap: Claude files not dual-profiled as Copilot |
| **Cursor** | 21 camelCase events including `workspaceOpen`; `type` optional (`command`/`prompt`); required `command` | Agent Skills at `.cursor/skills` | built-in `/create-subagent` (no extra schema check) | Rules “Keep rules under 500 lines”. [Third-party hooks](https://cursor.com/docs/reference/third-party-hooks) load Claude settings. `~/.cursor/hooks.json` still unread | **Holds.** User/MDM/third-party merge unread |
| **Grok Build** | 14 events exact; `command`/`http` | Frontmatter required; `name`/`description` optional | `.grok/agents/` still no filename pattern on the skills page; agents URL bot-blocked this run | MCP `command` or `url`; also loads `~/.claude.json`, `.cursor/mcp.json`, `.mcp.json` as **compat** (scanned under other schemas). Plugins documented, unread | **Holds** for scanned surfaces |
| **Command Code** | Four events; `type: command`; timeout 0–600 | Agent Skills; `.commandcode/skills` &gt; `.agents/skills`; `SKILL.md` | Reserved `explore`/`plan`/`review`/`general`; `permissionMode` `inherit` + `default`/`auto-accept`/`bypass`/`plan`/`dont-ask` | MCP `http`/`stdio`; local `~/.commandcode/projects/{slug}/mcp.json` still unpublished slug | **Holds.** Local MCP unread still correct |
| **Codex** | n/a | `.codex/skills` Agent Skills | n/a | MCP `command` or `url`; AGENTS chain `AGENTS.override.md` then `AGENTS.md`; default **32 KiB** `project_doc_max_bytes` | **Holds** |
| **Gemini CLI** | 11 PascalCase events; `type: command` only; nested groups; `$GEMINI_PROJECT_DIR` | n/a in this pass | n/a | Launch `command`/`url`/`httpUrl`. Underscore-alias **warning still quoted** on GitHub: policy parser splits FQN on first `_` after `mcp_`. Canonical HTML now [geminicli.com/docs/hooks/](https://geminicli.com/docs/hooks/). `~/.gemini/settings.json` still unread, still a documented merge layer | **Holds.** Global still unwired |
| **Windsurf / Cascade** | 12 snake_case events; `command` or `powershell` | `.windsurf/skills` Agent Skills | n/a | Rules 12 000 workspace / 6 000 global; `trigger` required; MCP `command`/`serverUrl`/`url`. System `/etc/windsurf/hooks.json` documented, unread | **Holds** |
| **Agent Skills spec** | n/a | Required `name`+`description`; 64 / 1024; `compatibility` ≤500; `metadata` map; 500-line rec | n/a | n/a | **Holds** |
| **AGENTS.md** | n/a | n/a | n/a | [agents.md](https://agents.md/): nested, nearest wins. Codex concatenates root→cwd. `budget.agents-md` 150 lines remains a **heuristic** (Morph and others recommend much shorter) | **Holds** as labeled |
| **OpenCode** | n/a | n/a | n/a | V2 `mcp.servers`; `type` `local`/`remote`; local `command` **argv array**; `{env:NAME}` interpolation (discover regex already allows `{env:VAR}`) | **Holds**. Cite both `/docs/mcp-servers/` and `/v2/docs/mcp-servers/` |
| **Continue** | n/a | n/a | n/a | Standalone YAML `name`/`version`/`schema`; launch `command`/`url`/`uses`; copied JSON allowed | **Holds** |
| **Antigravity** | none published as a check surface | n/a | n/a | Still `command` or `serverUrl`. Project `.agents/mcp_config.json` **and** global `~/.gemini/config/mcp_config.json` (2.0/CLI). Global unread (spec already says so) | **Project holds.** Global still unread |
| **Kiro** | **Published:** `.kiro/hooks/*.json`, `version: "v1"`, PascalCase triggers (`PostFileSave`, `PreToolUse`, `Stop`, …), `action.type` `command`\|`agent` | Agent Skills at `.kiro/skills/` and `~/.kiro/skills/`; `name` must match folder | Custom-agent config reference (IDE 1.0 / CLI 3.0): `name`, `description`, `mcpServers`, `permissions`, `hooks` (CLI only) | Checkable. Matrix still `none` | **Gap — silence** |
| **Cline** | Config lists `.cline/hooks/` and `~/.cline/hooks/` (hooks reference page did not render; treat schema as unpublished until a full fetch) | Agent Skills-shaped: `.cline/skills/`, `~/.cline/skills/`; required `name` matches dir; `description` max 1024 | `.cline/agents/`, `~/.cline/agents/` | MCP at `~/.cline/data/settings/cline_mcp_settings.json`; rules under `.cline/rules` | **Gap — silence** (skills/config checkable; hooks schema not fully fetched) |
| **Roo Code** | not fetched as a hook spec | Agent Skills: `.roo/skills/`, `~/.roo/skills/`, also `~/.agents/skills/` | n/a this pass | Skills page is enough to start a capture | **Gap — silence** |
| **Kilo Code** | n/a this pass | Agent Skills: `.kilo/skills/`, `~/.kilo/skills/`; also `.agents/skills/` and `.claude/skills` (compat) | n/a | `kilo.jsonc` extra skill paths | **Gap — silence** |
| **Junie** | n/a this pass | `.junie/skills/`, `~/.junie/skills/`, `.agents/skills/`. **`description` is optional** (do not copy Agent Skills `missing-description` as error) | n/a | MCP JSON documented for CLI | **Gap — silence** (schema differs on `description`) |

---

## Checkable assertions that already match code

Quoted or table-extracted from fetched pages (2026-09-06):

- Claude hook `type` enum: `"command"`, `"http"`, `"mcp_tool"`, `"prompt"`, or `"agent"`.
- Claude reserved MCP names: `workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview`, `Claude Browser`.
- CLAUDE.md: “target under 200 lines per CLAUDE.md file.”
- Cursor: “Keep rules under 500 lines.”
- VS Code: “VS Code supports eight hook events”; “Each hook entry must have `type: "command"`.”
- Copilot: “one of `bash`, `powershell`, or `command`, unless `exec` is specified”; prompt hooks “only supported on `sessionStart`.”
- Grok: 14 events listed on [hooks](https://docs.x.ai/build/features/hooks); `type` `"command"` or `"http"`.
- Command Code settings: “Only four events are recognized: `PreToolUse`, `PostToolUse`, `Stop`, and `SessionStart`.”
- Gemini GitHub MCP page warning (still present): do not use `_` in server names; FQN split after `mcp_` can make policies fail silently.
- Windsurf: “Cascade provides twelve hook events”; workspace rules “Limited to 12,000 characters per file”; global “Limited to 6,000 characters.”
- Codex: combined AGENTS.md truncated at `project_doc_max_bytes` (32 KiB default).
- Agent Skills: `name` yes, `description` yes, 64 / 1024.

---

## Issues

All 16 are **coverage / honesty**, not false positives on shipped checks. Spec-required event lists still hold. Do not ship `error` until a `docs/spec/` capture quotes the line.

| ID | Pri | Type | Agent | Issue | Surface | Evidence | Suggested next |
|----|-----|------|-------|-------|---------|----------|----------------|
| I-01 | P0 | gap | Kiro | Matrix says `none`; vendor now publishes hooks, skills, agents | `.kiro/hooks/*.json` (`version: "v1"`), `.kiro/skills/`, custom-agent config | [hooks](https://kiro.dev/docs/hooks/), [skills](https://kiro.dev/docs/skills/), [agents](https://kiro.dev/docs/custom-agents/configuration-reference/) | Capture spec → unknown-event / missing-script / Agent Skills (same shape as plan 042) |
| I-02 | P1 | gap | Cline | Skills, rules, agents, hooks dirs published; not scanned | `.cline/skills/`, `.cline/hooks/`, `.cline/agents/`, `.cline/rules/`; `~/.cline/*` | [skills](https://docs.cline.bot/customization/skills), [config](https://docs.cline.bot/getting-started/config) | Capture skills first. **STOP on hooks** until the hooks page renders a quoted event list |
| I-03 | P1 | gap | Roo | Agent Skills dirs published; not scanned | `.roo/skills/`, `~/.roo/skills/`, `~/.agents/skills/` | [skills](https://docs.roocode.com/features/skills) | Capture + apply Agent Skills profile |
| I-04 | P1 | gap | Kilo | Agent Skills dirs published; not scanned | `.kilo/skills/`, `~/.kilo/skills/`; also `.agents/skills`, `.claude/skills` (compat) | [skills](https://kilo.ai/docs/customize/skills) | Capture + apply Agent Skills profile |
| I-05 | P1 | gap | Junie | Skills published; **`description` is optional** | `.junie/skills/`, `~/.junie/skills/`, `.agents/skills/` | [agent skills](https://junie.jetbrains.com/docs/agent-skills.html) | Capture. Do **not** reuse `agent-skills.skill.missing-description` as error |
| I-06 | P1 | honesty | Copilot CLI | Docs now load `.claude/settings.json` as Copilot hooks; scanner treats file as Claude-only | `.claude/settings.json`, `.claude/settings.local.json` | [hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference) | Dual-profile or document the choice. A Copilot-only event here is `claude.hook.unknown-event` |
| I-07 | P2 | gap | VS Code | Agent-scoped hooks unread | `.agent.md` frontmatter `hooks` | [hooks](https://code.visualstudio.com/docs/agent-customization/hooks) | Discover + `vscode.hook.missing-script` / unknown-event |
| I-08 | P2 | gap | VS Code | Plugin hook files unread | plugin `hooks.json` / `hooks/hooks.json` | same page | Same as I-07; plugin root for script resolve |
| I-09 | P2 | docs | VS Code | Live schema also lives on a new URL | — | [hooks-reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference) | Add/retarget spec capture; 8 events still match |
| I-10 | P2 | gap | Cursor | User hooks documented, unread | `~/.cursor/hooks.json` | [third-party hooks](https://cursor.com/docs/reference/third-party-hooks) (priority list) | Wire under `--global` or keep unread **and** say so (README already does) |
| I-11 | P2 | honesty | Cursor | Third-party merge loads Claude settings; not described as Cursor-consumed | `.claude/settings.json` (imported) | same page | Document mapping; do not weaken Claude `type` checks |
| I-12 | P2 | gap | Gemini | User/system settings still a documented merge layer, `--global` unwired | `~/.gemini/settings.json`, `/etc/gemini-cli/settings.json` | [hooks](https://geminicli.com/docs/hooks/) | Wire `--global` or keep unread (README already does) |
| I-13 | P2 | docs | Gemini | Canonical HTML moved off GitHub blob | — | [geminicli.com hooks](https://geminicli.com/docs/hooks/), [MCP](https://geminicli.com/docs/tools/mcp-server/). Underscore warning still on [GitHub raw](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md) | Point `source.url` at geminicli.com; keep GitHub for the warning quote |
| I-14 | P2 | gap | Antigravity | Global MCP is now a primary 2.0/CLI path, unread | `~/.gemini/config/mcp_config.json` | [MCP](https://antigravity.google/docs/mcp/). Project `.agents/mcp_config.json` **is** scanned | `--global` open, or keep unread (spec already notes it) |
| I-15 | P3 | docs | OpenCode | Two live MCP URLs; checks cite V2 | `opencode.json(c)` | [docs](https://opencode.ai/docs/mcp-servers/), [v2](https://opencode.ai/v2/docs/mcp-servers/) | Cite both in capture; schema still `type` local/remote + argv `command` |
| I-16 | P3 | honesty | README | Coverage matrix still `none` for Kiro/Cline/Roo/Kilo/Junie after vendors published pages | `README.md` coverage table | this audit | After captures, update the five-dimension row; until then the row is stale |

Already-correct unread (not new issues): Command Code `projects/{slug}/mcp.json` (slug unpublished); Copilot `/etc/github-copilot/policy.d`; Grok plugins / `.grok/agents/` (no filename pattern); Windsurf `/etc/windsurf/hooks.json`; Claude managed policy / marketplace plugins.

## Honesty / coverage gaps (priority)

These are **not** “the check is wrong.” They are documented working config that agentscan does not open, or a consumer the README denies.

1. **Kiro is no longer “no published check surface.”** [Hooks](https://kiro.dev/docs/hooks/), [skills](https://kiro.dev/docs/skills/), [custom agents](https://kiro.dev/docs/custom-agents/configuration-reference/). Highest-leverage new provider. Capture first; then unknown-event / missing-script / Agent Skills — same shape as Gemini/Cursor in plan 042.
2. **Cline / Roo / Kilo / Junie** now document Agent Skills directories (`.cline/skills`, `.roo/skills`, `.kilo/skills`, `.junie/skills`). Junie’s optional `description` is a STOP condition: do not reuse `agent-skills.skill.missing-description` as error.
3. **Copilot CLI reads `.claude/settings.json`.** [Hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference) lists it as a source. README currently: “`.claude/settings.json` stays Claude” / “not remapped to Copilot.” A Copilot-only event in that file would be `claude.hook.unknown-event`. Dual-profile or document the choice.
4. **VS Code agent-scoped hooks** (`.agent.md` frontmatter) and **plugin `hooks.json`** are on the live customization page. Same headline failure (missing script) as plan 020 was for Claude.
5. **Cursor third-party + user hooks.** Project `.cursor/hooks.json` is scanned; `~/.cursor/hooks.json` and Claude-imported hooks are documented and unread (user) or scanned as Claude (imported files).
6. **Gemini user settings** remain a documented merge layer (`~/.gemini/settings.json`, `/etc/gemini-cli/settings.json`) and still unwired for `--global`.
7. **Antigravity global** `~/.gemini/config/mcp_config.json` is now the 2.0/CLI primary path; project `.agents/mcp_config.json` still exists and is scanned.

---

## Practices vs heuristics

| Practice (2026) | agentscan | Fit |
|-----------------|-----------|-----|
| Hooks enforce; skills teach ([practitioner consensus](https://www.reddit.com/r/ClaudeAI/comments/1sv852q/claude_code_cheat_sheet_after_6_months_of_daily/)) | `*.hook.missing-script` is the product | Correct |
| Nearest `AGENTS.md` wins ([agents.md](https://agents.md/)) | Nested walk-up | Correct |
| Keep instruction files small | `budget.claude-md` 200 (vendor); `budget.agents-md` 150 (heuristic); Codex 32 KiB (vendor) | Correctly labeled. Do not promote 150 to error — Morph-style “20–30 lines” is commentary |
| Cursor rules &lt; 500 lines | `cursor.rule.too-large` info | Holds |
| MCP secrets via interpolation, not literals | `mcp.literal-env`, `mcp.literal-credential`, `security.hardcoded-secret` | Holds; never echo values |
| Skill lock / installer hygiene | `skill.*-lock*` info/warning | Heuristic, labeled |
| Do not validate model IDs or MCP tool names against a hardcoded list | Explicit non-goal | Still right |

---

## What not to do

- Do not add Kiro/Cline/Roo/Kilo/Junie checks without `docs/spec/` captures and a conformance fixture. Cline’s hooks HTML did not render in this fetch; STOP until a full page quotes events.
- Do not apply Agent Skills `description` required to Junie.
- Do not treat Copilot-consumed `.claude/settings.json` as a reason to weaken Claude handler `type` checks.
- Do not invent Grok agent filename patterns; the agents page was bot-blocked and the skills page still does not quote one.

---

## Sources (fetched)

Claude: [hooks](https://code.claude.com/docs/en/hooks), [skills](https://code.claude.com/docs/en/skills), [sub-agents](https://code.claude.com/docs/en/sub-agents), [MCP](https://code.claude.com/docs/en/mcp), [memory](https://code.claude.com/docs/en/memory)  
Cursor: [hooks](https://cursor.com/docs/hooks), [rules](https://cursor.com/docs/rules), [skills](https://cursor.com/docs/skills), [third-party hooks](https://cursor.com/docs/reference/third-party-hooks)  
VS Code: [hooks](https://code.visualstudio.com/docs/agent-customization/hooks), [hooks reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference)  
Copilot: [hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)  
Grok: [hooks](https://docs.x.ai/build/features/hooks), [skills](https://docs.x.ai/build/features/skills-plugins-marketplaces), [MCP](https://docs.x.ai/build/features/mcp-servers), [AGENTS.md](https://docs.x.ai/build/features/project-rules)  
Command Code: [hooks](https://commandcode.ai/docs/hooks), [agents](https://commandcode.ai/docs/agents), [MCP](https://commandcode.ai/docs/mcp), [skills](https://commandcode.ai/docs/skills)  
Gemini: [hooks](https://geminicli.com/docs/hooks/), [hooks reference](https://geminicli.com/docs/hooks/reference/), [MCP](https://geminicli.com/docs/tools/mcp-server/), [GitHub MCP](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md)  
Windsurf: [hooks](https://docs.devin.ai/desktop/cascade/hooks), [MCP](https://docs.devin.ai/desktop/cascade/mcp), [memories](https://docs.devin.ai/desktop/cascade/memories)  
Codex: [MCP](https://learn.chatgpt.com/docs/extend/mcp), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)  
OpenCode: [MCP](https://opencode.ai/docs/mcp-servers/), [V2 MCP](https://opencode.ai/v2/docs/mcp-servers/)  
Continue: [MCP](https://docs.continue.dev/customize/deep-dives/mcp)  
Antigravity: [MCP](https://antigravity.google/docs/mcp/)  
Portable: [Agent Skills spec](https://agentskills.io/specification), [AGENTS.md](https://agents.md/)  
Previously unread: [Kiro hooks](https://kiro.dev/docs/hooks/), [Kiro skills](https://kiro.dev/docs/skills/), [Kiro agents](https://kiro.dev/docs/custom-agents/configuration-reference/), [Cline skills](https://docs.cline.bot/customization/skills), [Cline config](https://docs.cline.bot/getting-started/config), [Roo skills](https://docs.roocode.com/features/skills), [Kilo skills](https://kilo.ai/docs/customize/skills), [Junie skills](https://junie.jetbrains.com/docs/agent-skills.html)

Cline hooks HTML at `docs.cline.bot/customization/hooks` returned a stub index (not used as schema). Grok agents page was bot-blocked.
