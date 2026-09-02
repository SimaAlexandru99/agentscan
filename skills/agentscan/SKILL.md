---
name: agentscan
description: Use when auditing or changing agent config — hooks, skills, MCP, AGENTS.md, skills-lock.json. Run before editing hooks or claiming a guard is in place.
---

# agentscan

Read-only linter for agent config. Findings are facts.

## When

- Hook, skill, MCP, or `AGENTS.md` work
- Someone says a guard is on and you have not verified the script
- A PR touches `.claude/`, `.commandcode/`, `.agents/`, `.grok/`, `.devin/`, `.windsurf/`, `.codex/`, `.mcp.json`, or `skills-lock.json`

## Do

From the repo root:

```bash
npx @chimix/agentscan@latest --output prompt
```

`--output prompt` is the handoff for the agent that fixes. Do not skip `claude.hook.missing-script` (error).

No project handy:

```bash
npx @chimix/agentscan@latest demo
```

`demo` builds a throwaway fixture, prints the report, and deletes the fixture.

## Don't

- Write the scanned tree
- Guess with the model whether a hook is valid
- Compare a skill's frontmatter `name` to its directory, or validate model ids
