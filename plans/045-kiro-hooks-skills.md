# Plan 045: Scan Kiro hooks and Agent Skills against quoted pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 033ad94..HEAD -- src/facts/hook-schema.ts src/facts/provider.ts src/discover/index.ts src/discover/hooks.ts src/discover/skills.ts src/checks/hooks.ts src/checks/registry.ts src/config/schema.ts README.md scripts/spec-surfaces.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH (new hook event list — the class that shipped 25 false
  findings when copied from the wrong spec)
- **Depends on**: plans/044-coverage-matrix-published-unread.md (docs honesty;
  can land first or in the same PR after this, but do not leave the matrix
  saying `none` once discovery exists)
- **Category**: direction
- **Planned at**: commit `033ad94`, 2026-09-06
- **Issue ID**: I-01

## Why this matters

Kiro publishes a checkable hook schema at `.kiro/hooks/*.json` and Agent Skills
at `.kiro/skills/`. The Provider union already includes `"kiro"` and `.kiro` is
a root signal, so a Kiro-only tree is scannable and then silent. A
`PostFileSave` hook whose script was deleted is the product's headline failure
on a vendor the README still calls empty.

Do not copy Claude or Copilot events. Kiro uses its own PascalCase triggers
and `{ version, hooks: [ { trigger, action } ] }` files — one file is not a
Claude `hooks` object keyed by event name.

## Current state

- `src/facts/provider.ts` — `"kiro"` is in `Provider`. `inferHookSchemaProfile`
  maps `kiro` to **Claude** (`src/facts/hook-schema.ts` lines 182–194). Adding
  discovery without a `kiro` profile would validate Kiro triggers against
  Claude's 33 names.
- `src/config/schema.ts` `skillPaths` does not include `.kiro/skills`.
- `schemaProfileFromSkillsDir` / `providerFromSkillsDir` do not mention `.kiro`.
- `src/discover/index.ts` never opens `.kiro/hooks`.
- Hook check switches (`src/checks/hooks.ts` `eventsFor`, `unknownEventRuleId`,
  `missingScriptRuleId`) are exhaustive on `HookSchemaProfile` and will not
  compile until a `"kiro"` profile is added to the union and every switch.
- Tests: model new cases on `tests/unit/gemini-cursor-hooks.test.ts` (Gemini
  nested vs Cursor flat; Claude names reported unknown *for that provider*).
- Helpers: `mkPinnedProject` in `tests/helpers/tmp.ts`.

### Pages to capture (re-read live; do not trust this plan's paraphrases)

- https://kiro.dev/docs/hooks/
- https://kiro.dev/docs/skills/
- https://kiro.dev/docs/custom-agents/configuration-reference/ — **agents only
  if a filename pattern is quoted**. The 2026-09-06 read documented fields
  (`name`, `description`, `mcpServers`, `permissions`, `hooks`) but not a
  path like `.kiro/agents/*.json`. If still unquoted, leave agents unread
  (same STOP Grok used).

TinyFish 2026-09-06 observed (confirm on the page, then lock in the capture):

- Hook files: `.kiro/hooks/<id>.json`
- Shape: `{ "version": "v1", "hooks": [ { "name", "trigger", "matcher?", "action": { "type", "command"? , "prompt"? } } ] }`
- `action.type`: `"command"` or `"agent"`
- `command` required when type is command; `prompt` required when type is agent
- Example trigger identifier: `PostFileSave`. Prose labels on the same page
  ("Prompt Submit", "File Save") are **not** event names until the page
  shows the PascalCase token.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec | `bun run spec:check` | exit 0 after `spec:record` for new URLs |
| Rules table | `bun run readme:rules` | README rules block matches registry |

## Suggested executor toolkit

- Read `plans/042-gemini-and-cursor-hooks.md` for the "own profile, own
  events, Claude name is unknown here" pattern.
- Spec file shape: `docs/spec/gemini-hooks.md` (`Source` / `Read` / `Depends
  on it` / quoted event table / Deliberately unread).

## Scope

**In scope**:
- `docs/spec/kiro-hooks.md`, `docs/spec/kiro-skills.md` (required)
- `docs/spec/kiro-agents.md` only if a filename pattern is quoted
- `docs/spec/README.md` index rows
- `scripts/spec-surfaces.ts` + `bun run spec:record` for the new URLs
- `src/facts/hook-schema.ts` — add `"kiro"` to `HookSchemaProfile`; do **not**
  leave `case "kiro"` falling through to Claude
- `src/facts/kiro.ts` (new) — `KIRO_HOOK_EVENTS`, handler types
- `src/discover/kiro.ts` (new) — read `.kiro/hooks/*.json`
- `src/discover/index.ts` — call Kiro hook discovery; `--global`
  `~/.kiro/skills` when `includeGlobal`
- `src/discover/skills.ts` / `src/facts/provider.ts` /
  `src/config/schema.ts` — `.kiro/skills` as Agent Skills
- `src/checks/hooks.ts` — exhaustive switches
- `src/checks/registry.ts` — new ids with `source: { kind: "spec", url, capture }`
- `README.md` coverage row (replace 044's unread cells for what you open)
- Tests: `tests/unit/kiro-hooks.test.ts` (or similar); conformance fixture
  under `tests/fixtures/conformance/` if you copy a vendor example verbatim
- `tests/unit/rule-sources.test.ts` must still pass (every registry `source`)

**Out of scope**:
- Cline/Roo/Kilo/Junie (046–049)
- Inventing `.kiro/agents/` if the page has no path
- Validating model ids, MCP tool names, or Kiro "powers"
- Opening `~/.kiro` credentials / session files
- Version bump to 1.5.0 unless the operator asks; 042 added checks at 1.4.0

## Git workflow

- Branch: `advisor/045-kiro-hooks-skills`
- Commit: `feat: scan Kiro hooks and skills`
- Do NOT push unless asked.

## Locked check ids (hooks)

Use these ids; do not invent Claude-shaped extras:

| ID | Severity | Provenance | When |
|----|----------|------------|------|
| `kiro.hook.unknown-event` | error | spec-required | `trigger` not in the quoted PascalCase set |
| `kiro.hook.missing-script` | error | internal-consistency | command action points at a path-like script that does not exist |
| `kiro.hook.command-without-command` | error | spec-required | `type: command` with no `command` |
| `kiro.hook.prompt-without-prompt` | error | spec-required | `type: agent` with no `prompt` (only if the page requires `prompt`) |
| `kiro.hook.unknown-handler-type` | error | spec-required | `action.type` missing or not a quoted value |
| `kiro.hook.invalid-group` | error | spec-required | only if the page requires `version` / `hooks` array and a file omits them |

Skills: reuse existing `agent-skills.skill.*` (`.kiro/skills` is the open
standard on the Kiro skills page). Do **not** add `kiro.skill.*` duplicates.

Missing-script: same conservative resolver as Claude — skip `npx`, pipes,
unresolved env. Expand nothing that is not quoted.

## Steps

### Step 1: Capture specs

Write `docs/spec/kiro-hooks.md` and `docs/spec/kiro-skills.md` with
`**Read:** 2026-09-06` (or today's date if you re-fetch later). Quote the
trigger identifier table, file path, `version`, action types, and required
fields. List Deliberately unread. Add `SPEC_SURFACES` entries. Run
`bun run spec:record` then `bun run spec:check`.

**Verify**: `bun run spec:check` exits 0. Capture contains a fenced list of
exact trigger tokens, not only prose labels.

### Step 2: Profile and facts

Add `"kiro"` to `HookSchemaProfile`. Remove `kiro` from the Claude fallthrough
in `inferHookSchemaProfile`. Export `KIRO_HOOK_EVENTS` from `src/facts/kiro.ts`.

**Verify**: `bun run typecheck` fails on incomplete switches until step 3 —
that is expected. Do not add `default: return KNOWN_HOOK_EVENTS`.

### Step 3: Discover `.kiro/hooks/*.json`

New reader. Do **not** run these files through `hooksFromObject` (that API is
event-keyed objects). Parse the array-of-hooks shape. Skip non-`.json`. A
malformed file is `config.unreadable`, never a thrown parse.

Call it from `discover/index.ts` on each ancestor dir (same loop as
`.windsurf/hooks.json`).

`--global`: `~/.kiro/skills` only, matching other skill globals. Do not invent
a global hooks path unless the page quotes one.

**Verify**: a fixture with one documented `PostFileSave` command hook and a
present script produces a `HookFact` with `schemaProfile: "kiro"` and zero
`kiro.hook.*` findings.

### Step 4: Wire checks and skills

Update `src/checks/hooks.ts` switches. Register ids in `STRUCTURAL_CHECKS`
with `lastVerified` today and `source.url` the hooks page.

Add `.kiro/skills` to `defaultConfig.skillPaths`. In
`schemaProfileFromSkillsDir` return `"agent-skills"` for `/.kiro/skills`.
In `providerFromSkillsDir` return `"kiro"`.

**Verify**: `bun test` includes a test that `name` mismatch on a Kiro skill
emits `agent-skills.skill.name-does-not-match-directory`.

### Step 5: Tests and README

Cases (mirror `tests/unit/gemini-cursor-hooks.test.ts`):

1. Official-shaped hook + existing script → no `kiro.hook.*`
2. Every quoted trigger accepted
3. Claude `PreToolUse` as Kiro `trigger` **is** `kiro.hook.unknown-event` if
   and only if that string is not on Kiro's list; if Kiro quotes `PreToolUse`,
   it is valid — do not reject it for being a Claude name
4. Missing script → `kiro.hook.missing-script`
5. `type: "command"` without `command` → `kiro.hook.command-without-command`
6. Valid Agent Skills `SKILL.md` under `.kiro/skills/ok/SKILL.md` → no
   agent-skills errors
7. `--global` `~/.kiro/skills` malformed SKILL.md → finding with `source:
   global` evidence (mock homedir like other global tests)

Update README coverage: project discovery names `.kiro/hooks` and
`.kiro/skills`; schema names the quoted trigger count; conformance fixture
name. Run `bun run readme:rules`.

**Verify**: `bun test && bun run typecheck && bun run build && bun run spec:check`

## Test plan

- New file `tests/unit/kiro-hooks.test.ts` as above.
- If a vendor example is copied verbatim, put it in
  `tests/fixtures/conformance/` and assert a minimum fact count like
  `tests/integration/conformance.test.ts`.
- Sync test: declared registry ids === emitted ids (existing test).

## Done criteria

- [x] `bun run typecheck` exits 0
- [x] `bun test` exits 0; new Kiro tests exist and pass
- [x] `bun run build` exits 0
- [x] `bun run spec:check` exits 0
- [x] `kiro` no longer falls through to Claude in `inferHookSchemaProfile`
- [x] No Copilot/Claude event alias map applied to Kiro
- [x] `plans/README.md` status row updated

## STOP conditions

- The live hooks page does not quote PascalCase trigger identifiers — STOP;
  do not treat "File Save" as `FileSave`.
- Agents page still has no filename pattern — leave agents unread; do not
  guess `.kiro/agents`.
- A quoted field contradicts this plan's ID table — prefer the page; update
  the capture; do not keep a planned id that the page does not support.
- You need to open files outside `.kiro/hooks`, `.kiro/skills`, and
  `--global` `~/.kiro/skills`.

## Maintenance notes

- `spec:check` must hash the Kiro URLs. A new trigger name is a recapture,
  not a code guess.
- Reviewer: confirm a Claude-shaped `hooks: { PreToolUse: [...] }` file in
  `.kiro/hooks/` is either `config.unreadable` / unexpected-shape or
  unknown-event — never silently treated as Claude.
- Follow-up: Kiro custom agents (blocked here without a path).
