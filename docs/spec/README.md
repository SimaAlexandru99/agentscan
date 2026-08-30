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
| [hook-events.md](hook-events.md) | The 31 dispatched hook event names | `claude.hook.unknown-event` |
| [hook-sources.md](hook-sources.md) | The seven files a hook can be registered in, and how each one's script paths resolve | `claude.hook.missing-script`, `claude.hook.unknown-event` |
| [skills.md](skills.md) | Claude Code SKILL.md frontmatter fields | `claude.skill.missing-frontmatter`, `claude.skill.missing-description`, and two deleted checks |
| [agent-skills.md](agent-skills.md) | Portable Agent Skills required `name` / `description` | `agent-skills.skill.*` |
| [agents.md](agents.md) | Claude subagent frontmatter | every `claude.agent.*` check |
| [mcp.md](mcp.md) | Claude `.mcp.json` shape and transports | `claude.mcp.no-launch`, `claude.mcp.url-without-type`, `mcp.command-missing` |
| [vscode-mcp.md](vscode-mcp.md) | VS Code `.vscode/mcp.json` `servers` wrapper | `vscode.mcp.no-launch` |
| [cursor-mcp.md](cursor-mcp.md) | Cursor `.cursor/mcp.json` | `cursor.mcp.no-launch` |
| [antigravity-mcp.md](antigravity-mcp.md) | Antigravity `serverUrl` | `antigravity.mcp.no-launch` |
| [codex-mcp.md](codex-mcp.md) | Codex `[mcp_servers.*]` TOML | `codex.mcp.no-launch` |
| [thresholds.md](thresholds.md) | Every numeric threshold and its evidence | all `budget.*`, `skill.description-budget`, `codex.budget.instructions`, `cursor.rule.too-large` |

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
`skill.description-budget`, `budget.agents-md`, `budget.agents`, `budget.mcp`.

`scan.truncated` is not about the scanned project at all: it reports a limit of
this scanner, so that a check reading a bounded prefix of a file never looks
like a check that read all of it.

## Re-verification

```bash
bun run spec:check
```

Diffs the hardcoded hook-event set against the live docs page and warns when the
newest capture here is over 90 days old. It makes network calls, so it is a
release-time script and is never reached from `agentscan check` — the scan path
touches no network and that is worth more than automatic freshness. It
over-reports by design; adjudicated false alarms go in `REVIEWED_NOT_EVENTS`.

Anything in here can go stale. The list most likely to is
[hook-events.md](hook-events.md) — it already lagged by 22 names once. Re-read
the sources when a user reports a false positive on a value they believe is
valid, and when cutting a release.
