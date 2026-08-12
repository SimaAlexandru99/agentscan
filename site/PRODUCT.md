# agentscan — Persuade landing

Source of truth for product claims: repo `README.md`. Do not invent metrics.
Do not mention NDA projects.

## Product

**agentscan** is a Bun-first TypeScript CLI that audits agent configuration —
skills, `skills-lock.json`, hooks, MCP servers, agent definitions, and policy
files. Linters read the code your agent writes. This reads **the agent itself**.

Published as `@chimix/agentscan` on npm (bare name rejected as too close to an
unrelated `agent-scan`). The command stays `agentscan`.

## Job to be done

Find silent config/filesystem mismatches before they matter — for example a
`PreToolUse` hook still registered after its script was deleted. Nothing else in
the stack will tell you.

## Audience

Developers and teams shipping Claude Code / agent-skill setups who want a
deterministic, offline check they can run locally or in CI.

## Persuade mode (`/`)

### Hook (hero)

> Your agent config says the guard is on. The script is gone. Nothing told you.

### Primary CTA

Copyable install:

```bash
npx @chimix/agentscan check
```

Secondary: link to `/docs`, GitHub, npm.

### Proof (static terminal)

Show the README sample shape for `hook.missing-script` — registered hook, missing
script, warn + score. Do not invent other findings or project names beyond the
README sample.

### Trust (prose / list — not a card grid)

- No AI
- No network
- Writes nothing to the scanned tree
- Every check sourced to a published spec line (`docs/spec/`)

### Honesty (required)

Alpha. An earlier build reported 37 findings across 17 real projects of which
**25 were false** — two checks had been written from what real projects looked
like instead of from the spec. Both were deleted. Survivors are recorded in
`docs/spec/` with source URL and date read. That story is why the tool looks
like this.

### What not to claim

- No fake testimonials, logos, or adoption numbers
- Do not invent check counts beyond README badges/copy already used for framing
- Do not name internal/NDA projects

## Read mode (`/docs`)

Quickstart (npx / bunx / local checkout), `check` flags table from README, CI
with `uses: SimaAlexandru99/agentscan@v0` (`fail-on`) and `bunx` alternative.

## Brand signal

**agentscan** must read as the hero-level brand on the first viewport. Accent is
Signal Amber on a warm dark canvas — see `DESIGN.md` after UI ships.
