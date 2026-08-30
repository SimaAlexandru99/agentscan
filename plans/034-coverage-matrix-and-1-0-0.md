# Plan 034: Publish the coverage matrix and release 1.0.0

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- README.md scripts/spec-drift.ts src/version.ts package.json`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/033-remaining-providers.md
- **Category**: docs
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

1.0.0 is a honesty release: the README states, per provider, what is actually
audited. `spec:check` must watch more than Claude hook events so lists do not
rot the way they did once already.

## Scope

**In scope**: README coverage table, `scripts/spec-drift.ts` machine list,
version `1.0.0`, badge counts, `docs/spec/README.md` index of all captures.

**Out of scope**: Claiming `full` for a surface that only has inventory.

## Coverage cells

For each provider (`agent-skills`, `AGENTS.md`, `claude`, `codex`, `vscode`,
`cursor`, `grok`, `antigravity`, `gemini`, `windsurf`, `kiro`, `cline`, `roo`,
`kilo`, `opencode`, `junie`, `continue`):

`instructions | skills | agents | hooks | MCP` = `full | partial | none`

**full** = documented locations discovered + spec-required fields checked +
conformance fixture green. **partial** = some locations or some checks.
**none** = not implemented.

Fill the table from the tree, not from this plan’s hopes.

## Steps

1. Inventory `src/discover` and `STRUCTURAL_CHECKS` prefixes.
2. Write the README table. Keep the 0.8.0 product sentence only if it is still
   true; otherwise describe 1.0.0 accurately.
3. Add `scripts/spec-surfaces.json` (or a const in `spec-drift.ts`):

```ts
type SpecSurface = {
  provider: string;
  surface: string;
  lastVerified: string;
  sourceType: "official" | "vendor-recommendation";
  stalenessRisk: "low" | "medium" | "high";
  url: string;
};
```

`spec:check` warns when `lastVerified` is > 90 days (already) and, where
cheap, fetches `url` like hook events. Do not fetch from `agentscan check`.

4. Set version `1.0.0` in `package.json` and `src/version.ts`.
5. Update test/check count badges from actual `bun test` / registry length.

## Done criteria

- [ ] README matrix matches implemented code
- [ ] No cell says `full` without a conformance fixture or equivalent tests
- [ ] Version 1.0.0
- [ ] `bun test`, `bun run typecheck`, `bun run build`, `bun run spec:check` exit 0

## STOP conditions

- Marking unimplemented providers `full`.
- Putting network in the scan path.

## Maintenance notes

Every later provider PR updates one matrix row and one `SpecSurface` entry.
