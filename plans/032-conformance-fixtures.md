# Plan 032: Add official-example conformance fixtures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- tests/fixtures tests/integration`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/024-agent-skills-profile.md, plans/025-mcp-profile-parsers.md, and any 028–031 surfaces already implemented
- **Category**: tests
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

The tool’s failure mode is reporting valid vendor config as broken. Fixtures
copied from official examples with **zero** expected findings lock that
contract. Unofficial “looks like” trees are how the 9-of-31 hook list shipped.

## Scope

**In scope**: `tests/fixtures/conformance/<provider>/` and a single integration
test that scans each fixture and asserts `findings.filter(severity error|warning)`
is empty (info heuristics may still fire — assert by rule provenance or
allowlist info IDs).

**Out of scope**: Fixtures invented from blog posts; real tokens.

## Steps

1. For each shipped profile, copy the **example JSON/TOML/SKILL.md** from the
   spec file that 021/028+ already quoted. Replace any token-looking strings
   with obviously fake values (`https://example.com/mcp`, `npx`, no `sk-` prefixes).
2. Providers: `agent-skills`, `claude-json`, `vscode-json`, `cursor-json`,
   `antigravity-json`, `codex-toml` (if shipped), plus any 028–031 examples.
3. Test file `tests/integration/conformance.test.ts`: for each fixture directory,
   `analyze({ dir: fixture })` → no error/warning findings.
4. If an official example **should** fail a real check (e.g. docs show a
   placeholder missing script), do not use that example; pick one that is
   complete, or skip that provider.

## Done criteria

- [ ] At least four conformance fixtures
- [ ] Integration test green
- [ ] No live secrets in the tree (`rg sk-ant- tests/fixtures/conformance` empty)

## STOP conditions

- Adding a fixture that is not derived from a captured official example.
- Weakening a spec-required check so a sloppy fixture goes green.

## Maintenance notes

When a vendor changes their example, update the fixture and the spec capture
together.
