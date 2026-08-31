# agentscan — Persuade landing

Source of truth for product claims: repo `README.md` (1.1.0). Do not invent
metrics. Do not mention NDA projects.

## Product

**agentscan** 1.1.0 is a Bun-first TypeScript CLI that audits agent
configuration — skills, `skills-lock.json`, hooks, MCP servers, agent
definitions, and policy files. 72 checks. Linters read the code your agent
writes. This reads **the agent itself**.

Published as `@chimix/agentscan` on npm (bare name rejected as too close to an
unrelated `agent-scan`). The command stays `agentscan`.

## Job to be done

Find silent config/filesystem mismatches before they matter — for example a
`PreToolUse` hook still registered after its script was deleted. Nothing else in
the stack will tell you.

## Audience

Developers and teams shipping Claude Code, Command Code, and agent-skill setups
who want a deterministic, offline check they can run locally or in CI.

## Persuade mode (`/`)

### Hook (hero)

> Your agent config says the guard is on. The script is gone. Nothing told you.

Version line under the lede: `1.1.0 · 72 checks · offline on check`.

### Primary CTA

Copyable install:

```bash
npx @chimix/agentscan check
```

Secondary: link to `/docs`, GitHub, npm.

### Proof (static terminal)

Show the README killer-case sample for `claude.hook.missing-script` — registered
hook, missing script, **error** + score 90/100. Do not invent other findings or
project names beyond the README sample. Do not use the 0.7 id
`hook.missing-script` or a WARN sample.

### Trust (prose / list — not a card grid)

- No AI, no network on `check`
- Writes nothing to the scanned tree
- 72 checks, each labeled spec-required, vendor-recommendation, security,
  internal-consistency, or heuristic
- Spec-required checks cite a published line (`docs/spec/`). Heuristics stay at
  `info` and are labeled.

### Honesty (required)

An earlier build reported 37 findings across 17 real projects of which
**25 were false** — two checks had been written from what real projects looked
like instead of from the spec. Both were deleted. Spec-required checks cite a
published line in `docs/spec/`. Heuristics stay at `info` and are labeled.
1.0.0 was the first stable release. 1.1.0 ships 72 checks, 377 tests, still
offline on `check`. Native Command Code support is sourced from official
commandcode.ai pages, not from observed projects.

Do not say Alpha. Do not say “no heuristics”. Do not say every check is sourced
to a published spec line.

### What not to claim

- No fake testimonials, logos, or adoption numbers
- Do not invent check counts beyond README badges/copy already used for framing
  (1.1.0: 72 checks, 377 tests)
- Do not name internal/NDA projects
- Do not claim Command Code local-project MCP (`projects/{slug}/mcp.json`) is
  scanned — the slug encoding is unpublished

## Read mode (`/docs`)

Quickstart (npx / bunx / local checkout), `check` flags table from README, skill
sample using `claude.hook.missing-script` (error), CI with
`uses: SimaAlexandru99/agentscan@v1` (`fail-on`) and `bunx` alternative.

## Brand signal

**agentscan** must read as the hero-level brand on the first viewport. Accent is
Signal Amber on a warm dark canvas — see `DESIGN.md` after UI ships.
