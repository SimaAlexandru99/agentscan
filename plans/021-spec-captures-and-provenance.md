# Plan 021: Capture specs and add provenance on the registry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d521066..HEAD -- src/checks/registry.ts docs/spec scripts/spec-drift.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `d521066`, 2026-08-30

## Why this matters

The repo rule is that a check cites a published spec line. `.agents/skills`
is skipped today because `docs/spec/skills.md` only records Claude Code, and
MCP parsers reject VS Code / Antigravity / Codex shapes because `docs/spec/mcp.md`
only records Claude's `mcpServers` + `command`/`url`. Without captures, later
plans cannot add checks without repeating the 25-false-finding failure.

## Current state

- `src/checks/registry.ts` — `STRUCTURAL_CHECKS` is `{ id, description }[]` (lines 7–114). No provenance.
- `docs/spec/` has Claude-only files: `skills.md`, `agents.md`, `mcp.md`, `hook-events.md`, `hook-sources.md`, `thresholds.md`.
- `scripts/spec-drift.ts` requires `**Read:** YYYY-MM-DD` on every `docs/spec/*.md` except README, and diffs Claude hook events against https://code.claude.com/docs/en/hooks.
- Live Agent Skills spec (fetched 2026-08-30): https://agentskills.io/specification — `name` and `description` required; name 1–64, `[a-z0-9-]+`, no leading/trailing/consecutive hyphens, must match directory; description 1–1024.
- Live VS Code MCP (fetched 2026-08-30): https://code.visualstudio.com/docs/copilot/customization/mcp-servers — workspace file `.vscode/mcp.json`, top-level `servers`, `command` or `url`, `${input:...}`.
- Live Antigravity MCP (fetched 2026-08-30): https://antigravity.google/docs/mcp — workspace `.agents/mcp_config.json`, `mcpServers`, launch is `command` or `serverUrl`; `url`/`httpUrl` are not equivalents.
- Live Cursor MCP (fetched 2026-08-30): https://cursor.com/docs/context/mcp — project `.cursor/mcp.json`, `mcpServers`, `command` or `url`, interpolation `${env:NAME}`. Official STDIO table says `type` is required for stdio; remote examples use `url` without `type`.
- Codex MCP official page timed out during planning. Fetch https://developers.openai.com/codex/config and https://developers.openai.com/codex/mcp before writing `docs/spec/codex-mcp.md`. If both fail, omit the file and mark plan 025's Codex profile BLOCKED.

Match the existing spec file shape in `docs/spec/skills.md` (Source / Read / Depends on it / quoted tables).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass (250 at planned-at) |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec | `bun run spec:check` | exit 0, no `DRIFT:` for missing Read dates |

## Scope

**In scope**:
- `docs/spec/agent-skills.md` (required)
- `docs/spec/vscode-mcp.md`, `docs/spec/antigravity-mcp.md`, `docs/spec/cursor-mcp.md` (required; sources above)
- `docs/spec/codex-mcp.md` only if an official page is fetched
- `docs/spec/README.md` index rows
- `src/checks/registry.ts` — add `provenance` and `lastVerified` on each entry
- `scripts/spec-drift.ts` if the new files need any allow-list (capture dates already apply)
- Tests that construct `STRUCTURAL_CHECKS` entries, if TypeScript requires the new fields

**Out of scope**:
- New finding IDs or scan behavior
- Renaming check IDs
- MCP parsers, root resolution, skill skip removal

## Git workflow

- Branch: stay on the current feature branch
- Commit message style: `docs: capture Agent Skills and MCP specs, add rule provenance` (match `docs:` / `feat:` prefixes in `git log`)

## Steps

### Step 1: Write spec captures

Create the markdown files listed in Scope. Each must have `**Source:**`, `**Read:** 2026-08-30`, and `**Depends on it:**` (the later check IDs, even if those IDs are not emitted yet). Quote the launch-field and required-field sentences. Do not invent rules the page does not state.

For Cursor, record both facts: stdio table lists `type` as required, and the remote example uses `url` without `type`. Plan 025 must **not** apply `claude.mcp.url-without-type` to Cursor.

**Verify**: `rg -L '\\*\\*Read:\\*\\*' docs/spec/*.md` shows only `README.md` missing a Read date.

### Step 2: Add provenance on the registry

In `src/checks/registry.ts`, extend the entry type:

```ts
export type RuleProvenance =
  | "spec-required"
  | "vendor-recommendation"
  | "security"
  | "internal-consistency"
  | "heuristic";

export type StructuralCheck = {
  id: string;
  description: string;
  provenance: RuleProvenance;
  lastVerified: string; // YYYY-MM-DD
};
```

Assign (0.8.0 honesty; 027 may refine reasons, not these labels):

| IDs | provenance |
|-----|------------|
| `config.unreadable`, `hook.missing-script`, `skill.missing-skill-md`, `skill.broken-reference`, `skill.locked-not-installed`, `mcp.command-missing` | `internal-consistency` |
| `scan.truncated` | `internal-consistency` (scanner limit) |
| `hook.unknown-event`, `skill.missing-frontmatter`, `agent.*`, `mcp.no-launch`, `mcp.url-without-type` | `spec-required` |
| `skill.missing-description` | `vendor-recommendation` (Claude: Recommended) |
| `mcp.hardcoded-secret` | `security` |
| `mcp.literal-env` | `security` |
| `skill.not-in-lock`, `skill.no-lockfile`, `skill.duplicate-description`, `skill.description-budget`, `budget.agents-md`, `budget.agents`, `budget.mcp` | `heuristic` |
| `budget.claude-md` | `vendor-recommendation` |

`lastVerified`: `2026-08-30` for all.

**Verify**: `bun run typecheck` exits 0. `bun test tests/unit/checks.test.ts tests/unit/explain-rules.test.ts` still pass.

### Step 3: Index the spec README

Add rows to the table in `docs/spec/README.md` for the new files. Keep the "A check is written against a published spec line" rule. Add one sentence that provenance on the registry distinguishes spec-required from heuristic.

**Verify**: `bun run spec:check` exits 0.

## Test plan

- If `STRUCTURAL_CHECKS` is typed more strictly, add or extend a unit test that every entry has `provenance` and a `lastVerified` matching `YYYY-MM-DD`.
- Model after the existing sync test in `tests/unit/checks.test.ts` ("STRUCTURAL_CHECKS stays in sync").
- No new findings.

## Done criteria

- [ ] `docs/spec/agent-skills.md`, `vscode-mcp.md`, `antigravity-mcp.md`, `cursor-mcp.md` exist with Source/Read/Depends
- [ ] `docs/spec/codex-mcp.md` exists **or** 025 Codex is marked BLOCKED in `plans/README.md`
- [ ] Every `STRUCTURAL_CHECKS` entry has `provenance` and `lastVerified`
- [ ] `bun test`, `bun run typecheck`, `bun run build`, `bun run spec:check` exit 0
- [ ] Scan behavior unchanged (same finding IDs and severities)

## STOP conditions

- The live Agent Skills / VS Code / Antigravity / Cursor page contradicts the quotes above — recapture, do not keep stale claims.
- Codex official docs cannot be fetched — skip `codex-mcp.md`, do not invent a TOML schema.
- Adding provenance requires changing `make()` or finding JSON shape — stop; provenance is registry metadata only.

## Maintenance notes

Later plans (024–025) cite these files from comments beside new checks. Re-read the sources when cutting a release. `spec:check` will fail if a new spec file forgets `**Read:**`.
