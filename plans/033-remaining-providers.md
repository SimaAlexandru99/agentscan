# Plan 033: Add remaining MCP and config providers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/discover/mcp.ts src/config/schema.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/025-mcp-profile-parsers.md, plans/032-conformance-fixtures.md
- **Category**: direction
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

Windsurf, Kiro, Kilo, OpenCode, Continue, Gemini CLI, and Junie use
incompatible wrappers (`serverUrl` vs `url`, `mcp` key, command arrays,
YAML, V1 vs V2). A universal parser will lie.

## Spec captures (do first)

Official docs for each; write `docs/spec/<provider>-mcp.md` (or agents/rules)
with Source/Read/Depends. STOP per provider on failure.

Expected starting points (verify URLs still resolve):
- Windsurf MCP
- Kiro agent/MCP JSON
- Kilo MCP JSONC
- OpenCode config V1/V2
- Continue MCP YAML
- Gemini CLI settings
- Junie agent definitions

## Scope

Same pattern as 025: path → `schemaProfile` → launch fields → namespaced
no-launch checks. Command arrays: `hasCommand` if argv[0] is a non-empty
string; path-check argv[0] only when path-like.

## Steps

1. Capture specs.
2. Add default paths only when the official project path is known.
3. JSONC where comments are documented (Kilo).
4. YAML via existing `yaml` dependency for Continue.
5. OpenCode: branch V1 vs V2 from a documented discriminant; never apply V1
   required fields to V2.
6. Conformance fixture per shipped profile (032 style).
7. Do not apply `claude.mcp.url-without-type` to any of these.

## Done criteria

- [ ] Each implemented provider has a spec file and a zero-warning official fixture
- [ ] Gates green
- [ ] Uncaptured providers are listed as `none` for 034, not faked

## STOP conditions

- Guessing OpenCode V2 from a GitHub issue.
- Adding network calls to identify server versions.

## Maintenance notes

034’s matrix must match what actually landed, including skipped rows.
