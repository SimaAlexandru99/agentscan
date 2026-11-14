# agentscan — Persuade landing

Source of truth for product claims: repo `README.md` (2.0.0). Do not invent
metrics. Do not mention NDA projects.

## Product

**agentscan** 2.0.0 is a Bun-first TypeScript CLI that audits agent
configuration — skills, `skills-lock.json`, hooks, MCP servers, agent
definitions, and policy files, plus the Codex, Antigravity, Cursor, Gemini,
Kiro, Devin CLI, Claude Desktop, Amp, Zed, Qwen Code, Goose, and Factory Droid
contracts. 163 checks. Linters read the code your agent
writes. This reads **the agent itself**.

Published as `@chimix/agentscan` on npm (bare name rejected as too close to an
unrelated `agent-scan`). The command stays `agentscan`.

## Job to be done

Find silent config/filesystem mismatches before they matter — for example a
`PreToolUse` hook still registered after its script was deleted. Nothing else in
the stack will tell you.

## Audience

Developers and teams shipping Claude Code, Command Code, Codex, Cursor,
Gemini, Antigravity, Grok Build, Windsurf, Devin CLI, Kiro, Copilot, and
agent-skill setups who want a deterministic, offline check they can run
locally or in CI.

## Persuade mode (`/`)

### Hook (hero)

> Your agent config says the guard is on. The script is gone. Nothing told you.

Version line under the copy command: `2.3.1 · 163 checks · offline on check`.

### Primary CTA

Copyable install:

```bash
npx @chimix/agentscan check
```

Secondary: link to `/docs`, GitHub, npm.

### Proof (config-vs-disk explainer)

`ConfigDiskExplainer` shows the README killer-case sample for `claude.hook.missing-script` — registered
hook, missing script, **error** + score 90/100. Do not invent other findings or
project names beyond the README sample. Do not use the 0.7 id
`hook.missing-script` or a WARN sample.

### Trust (prose / list — not a card grid)

On the home this is the ordered "What you get after one run" list; the points
below stay true of every claim there.

- No AI, no network on `check`
- Writes nothing to the scanned tree
- 163 checks, each labeled spec-required, vendor-recommendation, security,
  internal-consistency, or heuristic
- Spec-required checks cite a published line (`docs/spec/`). Heuristics stay at
  `info` and are labeled.

### Honesty (required)

An earlier build reported 37 findings across 17 real projects of which
**25 were false** — two checks had been written from what real projects looked
like instead of from the spec. Both were deleted. Spec-required checks cite a
published line in `docs/spec/`. Heuristics stay at `info` and are labeled.
1.0.0 was the first stable release. 2.0.0 ships 143 checks, still
offline on `check`. It drops 0.7 rule ids: `ignoreRules`, `ignoreFindings`,
and `explain` accept only printed ids. `thresholds.skillDescriptionBytes`
and `thresholds.skills` are rejected; the listing budget is
`thresholds.skillListingChars`. Native contracts are sourced from official
pages, not from observed projects. Grok Claude/Cursor compatibility is
unread as schema identity. Windsurf auto-generated memories stay unread.
Devin CLI hooks, MCP, and skills are read, beside the Windsurf contract.
Copilot policy hooks and plugin `hooks.json` stay unread.
`.claude/settings.json` is Claude, not remapped to Copilot or Devin.

Do not say Alpha. Do not say “no heuristics”. Do not say every check is sourced
to a published spec line.

### What not to claim

- No fake testimonials, logos, or adoption numbers
- Do not invent check counts beyond README badges/copy already used for framing
  (2.0.0: 143 checks)
- Do not name internal/NDA projects
- Do not claim Command Code local-project MCP (`projects/{slug}/mcp.json`) is
  scanned — the slug encoding is unpublished
- Do not claim Grok managed/requirements TOML, plugins, `[skills] paths`,
  `.grok/agents/`, or Claude/Cursor files as Grok-consumed are scanned
- Do not claim Windsurf auto-generated memories, system rules, hooks, or
  skills, JetBrains `~/.codeium/hooks.json`, or a Windsurf project MCP path
- Do not claim Windows `%APPDATA%\devin`, or that `.claude/settings.json` is
  linted a second time as Devin. Devin CLI hooks, MCP, and skills are scanned
- Do not claim Cline hooks or Cline agents, `~/.cursor/skills/`, an OpenCode
  global config, or `~/.continue/config.yaml`
- Do not claim Antigravity `httpUrl` launches a server, or that plugin rules,
  plugin skills, or plugin hooks are read. Kiro agents are inventory only
- Do not claim Copilot `/etc/github-copilot/policy.d` or plugin `hooks.json`
  are scanned
- Do not claim `.claude/settings.json` is validated as Copilot CLI

## Pages

- `/checks` — every rule from `site/data/checks.json` (generated from the
  registry by `bun run site:data`): id anchor, severity, provenance,
  description, vendor source or "agentscan inference". Counts are computed.
- `/results` — the owner-approved write-up of one real run, copy in
  `lib/results.ts`. Anonymised: no project names, no secrets.
- `/changelog` — `site/data/releases.json` (from `CHANGELOG.md`), 2.0.0 to
  the latest. Only 2.0.0 and 2.3.1 were published to npm.

## Real-results figures (allowed, with their source)

Source: the author's own setup, 4 machines (one Linux, three Windows) and 29
project checkouts, 13–14 November 2026, agentscan 2.0.0 to 2.3.1.

- 10 real config problems found; 9 fixed the same day; 2 secrets taken out
  of config files; 0 network calls during check
- 692 → 251 findings on one home directory once agentscan's own false alarms
  were fixed; errors 406 → 40
- 46 vendor pages re-read on 14 November 2026
- "N / M checks cite the vendor page they come from" — computed from
  `checks.json` (`sourceUrl` count / rule count), never typed

Do not generalise these to other users' setups or present them as adoption.

## Read mode (`/docs`)

Quickstart (npx / bunx / local checkout), `check` flags table from README, skill
sample using `claude.hook.missing-script` (error), CI with
`uses: SimaAlexandru99/agentscan@v1` (`fail-on`) and `bunx` alternative.

## Brand signal

**agentscan** must read as the hero-level brand on the first viewport. Accent is
Signal Amber on a warm dark canvas — see `DESIGN.md` after UI ships.
