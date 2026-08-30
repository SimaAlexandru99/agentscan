# Plan 031: Discover vendor rule files with vendor limits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/discover src/checks src/config/schema.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/028-instruction-hierarchy.md
- **Category**: direction
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

Cursor, Antigravity, Gemini, Windsurf, Kiro, and Cline store rules in
product-specific directories with character or file-size limits. Applying
`budget.agents-md` to those files is the wrong unit.

## Spec captures (do first)

Official docs only, one file per vendor under `docs/spec/`:
- Cursor rules / `.cursor/rules`
- Antigravity rules
- Gemini CLI settings / rules
- Windsurf rules
- Kiro rules
- Cline rules

STOP when unofficial.

## Scope

Discovery + info-level size checks that quote the vendor limit. No global
“too many rules” heuristic unless a vendor states a count.

## Steps

1. Capture specs (paths + numeric limits).
2. Discover those paths with the existing traversal caps (`NESTED_DISCOVERY_MAX_DEPTH`, skip set).
3. Emit `cursor.rule.too-large` (example) at info when a captured character/line limit is exceeded. IDs must be namespaced.
4. Tests: official-shaped empty rule file → zero errors; over-limit → one info finding.

## Done criteria

- [ ] At least two vendors implemented with captures
- [ ] No vendor uses `budget.agents-md`
- [ ] Gates green

## STOP conditions

- Guessing a 150-line or 16k-byte limit.
- Scanning home-directory rule stores unless the user passed `--global` and the spec says that path is the project-equivalent.

## Maintenance notes

Limits change; `lastVerified` on the spec file and registry entry.
