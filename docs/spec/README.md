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
| [hook-events.md](hook-events.md) | The 31 dispatched hook event names | `hook.unknown-event` |
| [skills.md](skills.md) | SKILL.md frontmatter fields and what is required | `skill.missing-frontmatter`, `skill.missing-description`, and two deleted checks |
| [mcp.md](mcp.md) | `.mcp.json` shape and transports | `mcp.no-launch`, `mcp.url-without-type` |
| [thresholds.md](thresholds.md) | Every numeric threshold and its evidence | all `budget.*`, `skill.description-budget` |

## What is not spec-backed

Some checks assert internal consistency rather than conformance to a spec, and
need no source: `hook.missing-script`, `skill.broken-reference`,
`skill.not-in-lock`, `skill.locked-not-installed`, `config.unreadable`. Each
compares two things this repo can both observe — a config entry and the
filesystem. They cannot be wrong about an external standard because they do not
claim one.

## Re-verification

Anything in here can go stale. The list most likely to is
[hook-events.md](hook-events.md) — it already lagged by 22 names once. Re-read
the sources when a user reports a false positive on a value they believe is
valid, and when cutting a release.
