# Plan 040: Open Claude user hooks and user MCP under `--global`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git rev-parse --short HEAD` then
> `git diff --stat d040592..HEAD -- src/discover/index.ts src/discover/hooks.ts src/discover/mcp.ts src/facts/provider.ts src/config/schema.ts docs/spec/hook-sources.md docs/spec/mcp.md README.md`
> If any of those files changed since `d040592`, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (the user MCP file also holds session state — parsing it
  wrongly becomes a false `config.unreadable` or, worse, invents MCP
  servers from non-MCP keys)
- **Depends on**: plan 039 (DONE, shipped as 1.4.0 at `d040592`)
- **Category**: discovery
- **Planned at**: commit `d040592`, 2026-09-02

## Why this matters

Official Claude Code docs register hooks in `~/.claude/settings.json`
("All your projects") and MCP servers in `~/.claude.json` (quoted next to
`.mcp.json` and `claude mcp add-json`). Today `--global` opens
`~/.claude/skills` only. A `PreToolUse` guard in the user settings file
that points at a missing script, or a user-level MCP entry with `url` and
no `type`, is invisible — the same silent-guard failure the tool exists
for, on the two files the docs already name.

This is the same `--global` pattern Codex, Grok, Copilot, Command Code,
and Windsurf already use. It is not a new check id. Existing `claude.hook.*`
and `claude.mcp.*` / shared MCP rules apply once the facts exist.

## Current state

### What `--global` already opens for Claude

`src/discover/index.ts` (lines 156–173) adds `~/.claude/skills` when
`opts.includeGlobal` is true. The later `includeGlobal` block (lines
248–293) opens Copilot user hooks/settings, Grok/Codex/Command Code/
Windsurf user MCP, and Windsurf user rules/hooks. There is no Claude
user settings call and no Claude user MCP call.

```156:173:src/discover/index.ts
  if (opts.includeGlobal) {
    const home = homedir();
    const globalSkillDirs = [
      join(home, ".claude", "skills"),
      join(home, ".codex", "skills"),
      join(home, ".commandcode", "skills"),
      join(home, ".agents", "skills"),
      join(grokHomeDir(), "skills"),
      windsurfUserSkillsPath(home),
    ];
```

### Project Claude hooks (reuse this parser)

`discoverHooks` in `src/discover/hooks.ts` (lines 689–728) reads only
`<root>/.claude/settings.json` and `<root>/.claude/settings.local.json`.
Source is `"settings"`, profile `"claude"`, bases `{ project: root }`.
`hooksFromObject` is already exported.

```689:728:src/discover/hooks.ts
export function discoverHooks(root: string, errors: ConfigErrorFact[]): HookFact[] {
  const files = [
    join(root, ".claude", "settings.json"),
    join(root, ".claude", "settings.local.json"),
  ];
  // ...
        "settings",
        { project: root },
        errors,
        "claude",
        process.platform,
        "claude",
```

Do **not** add a new `HookFact.source` variant. User settings are the same
schema as project settings; the absolute path distinguishes them. Copilot
needed `"copilot-settings"` because that file is a different schema.

### Project Claude MCP (do not reuse `parseMcpFile` on `~/.claude.json`)

`defaultConfig.mcpPaths` (`src/config/schema.ts` lines 20–36) lists
`.mcp.json`, `.claude/mcp.json`, `mcp.json`, and other **project** files.
It does not list `~/.claude.json`. Keep it that way — putting an absolute
home path in `mcpPaths` would open the file on every scan, not only
`--global`.

`parseMcpFile` → `parseMcpServers` → `serversFromObject`
(`src/discover/mcp.ts` lines 212–258) does two things that are **wrong**
for `~/.claude.json`:

1. If `mcpServers` is absent and the root is not a pure server map, it
   pushes `unexpected-shape` ("no usable `mcpServers` object…"). A real
   `~/.claude.json` is a mixed file (session, per-project state, **and
   optionally** `mcpServers`). Most machines that have used Claude Code
   have this file with **no** `mcpServers`. That error would become
   `config.unreadable` on every `--global` scan — a false positive.
2. If every top-level value `looksLikeServerEntry`, the whole object is
   treated as a server map. Never let session / `projects` keys take that
   path.

`parseMcpServers` is **not exported**. Add a dedicated exported helper
that reads **only** `mcpServers` and stays silent when the key is absent.

`mcpProfileFromPath` (`src/facts/provider.ts` lines 125–194) falls through
to `"claude-json"` for any unmatched path. Add an explicit
`/(?:^|\/)\.claude\.json$/` arm so the user file is named, not accidental.

### Spec lines already captured (do not invent new ones)

`docs/spec/hook-sources.md` (read 2026-09-02):

> Where you define a hook determines its scope:
> - `~/.claude/settings.json` - All your projects
> - `.claude/settings.json` - Single project
> - `.claude/settings.local.json` - Single project
> - Managed policy settings - Organization-wide
> …

Current "Deliberately unread" list (lines 147–153) names
`~/.claude/settings.json` as unread. After this plan it is `--global`
only. Managed policy and `~/.claude/plugins` stay unread.

`docs/spec/mcp.md` (read 2026-09-02):

> When configuring MCP servers via JSON in `.mcp.json`, `~/.claude.json`, or
> `claude mcp add-json`, the `type` field accepts `streamable-http` as an alias
> for `http`.

Same `mcpServers` / `type` / reserved-name / url-without-type contract as
project Claude MCP. No published line says user MCP replaces project MCP
for the same name — inventory both, like Codex (`docs/spec/codex-mcp.md`,
`tests/unit/codex-mcp.test.ts`).

`docs/spec/vscode-hooks.md` line 82 currently says
"`~/.claude/settings.json` stays unread (Claude user settings)." Update
that sentence so it does not contradict this plan.

### Conventions to match

- User-file discovery: `discoverCodexUserMcp` in `src/discover/codex.ts`
  (early return if the file is missing; only called under `--global`).
- Tests: `tests/unit/codex-mcp.test.ts` and
  `tests/unit/copilot-settings-hooks.test.ts` — `spyOn(os, "homedir")` +
  `mkdtempSync`, `mkPinnedProject`, restore in `finally`.
- No new error check without a published line. No version bump. Changelog
  goes under existing `## Unreleased`.
- Never copy secret or session values into tests, findings, spec, or
  comments. Field paths and placeholder keys only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `bun test` | exit 0; new file's tests pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Build | `bun run build` | exit 0 |
| Spec drift | `bun run spec:check` | exit 0 (no new source URL) |
| Version | `node dist/cli.js --version` | `1.4.0` (do not bump) |

## Scope

**In scope**

- `src/discover/hooks.ts` — `discoverClaudeUserHooks`
- `src/discover/mcp.ts` — `discoverClaudeUserMcp` (or a thin
  `parseClaudeUserJsonMcp` used by a discover function next to Codex)
- `src/discover/index.ts` — wire both under `if (opts.includeGlobal)`
- `src/facts/provider.ts` — explicit `~/.claude.json` → `claude-json`
- `tests/unit/claude-global.test.ts` (create)
- `docs/spec/hook-sources.md`, `docs/spec/mcp.md`,
  `docs/spec/vscode-hooks.md`, `docs/spec/README.md` (one-line path note
  if the mcp.md row should mention `--global`)
- `README.md` — `--global` help row, `--global` section, coverage matrix
  Claude cell, known-limits Claude bullet
- `CHANGELOG.md` — Unreleased only
- `plans/README.md` — this plan's status row when gates pass

**Out of scope**

- `~/.claude/settings.local.json` (not in the seven-location list)
- `managed-settings.json`, MDM, server-managed policy
- `~/.claude/plugins` / marketplace installs
- Plugin `skills/` and `agents/`
- `~/.claude/agents` (user subagents — not this plan)
- `.claude/commands/` legacy skills
- `_disableBundledSkills` / bundled-skill overrides
- `$schema`, JSON comments, workspace trust
- Putting `~/.claude.json` on `defaultConfig.mcpPaths`
- Dual-parsing `.claude/settings.json` as Copilot
- Opening credential stores (`auth.json` or any session-only file)
- Reading hooks from `~/.claude.json` or MCP from `~/.claude/settings.json`
- `XDG_CONFIG_HOME` / `CLAUDE_CONFIG_DIR` relocation (not quoted in the
  captured settings/MCP pages as the path this scanner should open)
- New check ids, version 1.5.0, npm publish, conformance fixture edits
  (home files are not in-repo fixtures)
- `projects.<path>.mcpServers` inside `~/.claude.json` — not quoted as
  a config location on the MCP page. Top-level `mcpServers` only.

## Git workflow

- Branch: `cursor/claude-global-user-surfaces-7978` (already created for
  this plan; keep working on it).
- Commit style: `feat: …` / `docs: …` (see `53edc05`, `67ca374`).
- One or two commits is enough (code+tests, then docs — or one commit).
- Do not bump `package.json` / `src/version.ts`.
- Do not force-push. Do not merge to `master`.

## Steps

### Step 1: Claude user hooks

Add `discoverClaudeUserHooks(projectRoot, errors)` in
`src/discover/hooks.ts`.

1. Path is `join(homedir(), ".claude", "settings.json")` only.
2. Missing file → `[]`. No error.
3. Reuse the same JSON object + `hooks` extraction as `discoverHooks`.
   Preferred: extract `claudeSettingsHooksFromFile(filePath, projectRoot,
   errors)` and call it from both `discoverHooks` and the user function
   so the parser stays one.
4. Source `"settings"`, `sourceProvider: "claude"`,
   `schemaProfile: "claude"`.
5. `bases.project` is the **scanned project root** (`projectRoot` /
   `discoverAgentSurface`'s `root`), **not** `homedir()`.
   `${CLAUDE_PROJECT_DIR}` means the project being scanned. A user-level
   `PreToolUse` pointing at
   `${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh` must be existence-
   checked against that project (the killer case).
6. Same-event user + project hooks **coexist**. Do not add shadowing.
   The hooks page lists every location as a place a hook can be defined;
   it does not say user settings replace project settings.

Wire it in `src/discover/index.ts` inside `if (opts.includeGlobal)`, next
to `discoverCopilotUserSettingsHooks`. Pass `root` as `projectRoot`.

**Verify**: `bun test tests/unit/copilot-settings-hooks.test.ts` still
passes (refactor must not remake project settings Copilot).

### Step 2: Claude user MCP — `mcpServers` only

Add `discoverClaudeUserMcp(errors)` (file: `src/discover/mcp.ts` or a new
`src/discover/claude.ts` that imports a helper from `mcp.ts`).

Algorithm — follow this exactly:

1. `filePath = join(homedir(), ".claude.json")`. Missing → `[]`.
2. `readJsonConfig(filePath, errors)`. Unreadable / invalid JSON → `[]`
   (the helper already recorded `config.unreadable`). Do not add a second
   error.
3. If the root is not a JSON object → `unexpected-shape`
   ("Claude user config is not a JSON object") and `[]`.
4. If `"mcpServers"` is **absent** or `undefined` → `[]` and **no**
   error. This is the load-bearing case.
5. If `mcpServers` is present and is not a non-array object →
   `unexpected-shape` ("`mcpServers` is not an object") and `[]`.
6. Otherwise call the existing `parseMcpServers` with
   `{ mcpServers: obj.mcpServers }`, `filePath`, `root = homedir()`
   (command-path fallback, same idea as Codex passing `home`),
   profile `"claude-json"`.
7. Never pass the raw root object to `parseMcpServers` / `parseMcpFile`.
8. Never copy top-level keys (`oauthAccount`, `projects`, session
   fields, …) onto a fact. `McpFact.raw` stays `JSON.stringify` of the
   **server entry only** — that is already how `parseMcpServers` works;
   do not change it to stringify the whole file.

Export `parseMcpServers` only if you must; a dedicated
`parseClaudeUserJsonMcp` that performs steps 3–6 is clearer.

In `mcpProfileFromPath`, add an explicit match for `/.claude.json` (and
Windows-style `\.claude.json` via the existing `replaceAll("\\", "/")`)
returning `"claude-json"`. Do not change the default fallback.

Wire `discoverClaudeUserMcp` in the same `includeGlobal` block as
`discoverCodexUserMcp`, using the existing `mcpKey` / `mcpSeen`
dedupe. Same-name project `.mcp.json` and user `~/.claude.json` servers
**both stay**. Do not add `claudeEffective` / shadowing.

**Verify**: `bun test tests/unit/codex-mcp.test.ts` still passes.

### Step 3: Tests

Create `tests/unit/claude-global.test.ts`. Model helpers on
`tests/unit/codex-mcp.test.ts` (`tmpProject` via `mkPinnedProject`,
`write`, `spyOn(os, "homedir")`, `findingsFor`).

Required cases:

1. **Project settings still work without `--global`.** A project
   `.claude/settings.json` hook is discovered; `schemaProfile === "claude"`;
   `source === "settings"`.
2. **User settings are `--global` only.** Write
   `<tmpHome>/.claude/settings.json` with an unknown event (e.g.
   `NotARealEvent`) and a valid nested command handler. Without
   `includeGlobal`: no `claude.hook.unknown-event`. With it: that finding
   fires, and the hook's `path` is the home file.
3. **Killer case: missing script in user settings.** User
   `PreToolUse` command
   `${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-destructive-bash.js` (or
   the equivalent string the parser already accepts). Project has no such
   file. `--global` → `claude.hook.missing-script`. Finding `detail` /
   evidence must include the script path, not file contents.
4. **User + project hooks coexist** on the same event (two facts).
5. **User MCP is `--global` only.** `<tmpHome>/.claude.json` with
   `mcpServers.remote` `{ "url": "https://example.com/mcp" }` (no
   `type`). Without `--global`: server absent. With `--global`:
   `schemaProfile === "claude-json"`, `consumedBy` includes `"claude"`,
   finding `claude.mcp.url-without-type`.
6. **No `mcpServers` is not unreadable.** `<tmpHome>/.claude.json` is a
   JSON object with only a non-MCP key (e.g. `"numStartups": 1`). With
   `--global`: `facts.mcp` has no entry from that path, and findings do
   **not** include `config.unreadable`.
7. **Non-MCP keys never become servers.** Same file plus a `projects`
   object (empty object is enough). Still zero invented MCP facts.
8. **Session-shaped values never leak.** Give `mcpServers.ok` a valid
   `command: "npx"` entry **and** a sibling top-level string key whose
   value is a long token-shaped placeholder. Assert:
   - no fact `raw` contains that placeholder
   - no finding `message` / `detail` contains that placeholder
   Use a clearly fake placeholder (e.g. `TEST_SESSION_PLACEHOLDER_NOT_A_REAL_SECRET`).
   Do not use a live token format in the repo if you can avoid it; the
   point is leakage, not secret detection.
9. **Same name in `.mcp.json` and `~/.claude.json` both stay.** Two
   `docs` facts; secrets checks still inspect the user entry's `raw`
   (literal `env` key is enough — field name + a non-token literal, or
   reuse the Codex `sk-ant-…` pattern already in `codex-mcp.test.ts` if
   you need `security.hardcoded-secret`).
10. **`mcpProfileFromPath("/home/me/.claude.json") === "claude-json"`.**

**Verify**: `bun test tests/unit/claude-global.test.ts` → all new tests
pass.

### Step 4: Docs and changelog

Update, do not invent new source URLs:

- `docs/spec/hook-sources.md` — move `~/.claude/settings.json` out of
  "Deliberately unread" into a short `--global` paragraph. Keep managed
  policy and marketplace plugins unread.
- `docs/spec/mcp.md` — after the `~/.claude.json` quote, state that
  agentscan opens that file only under `--global` / `includeGlobal`,
  reads only top-level `mcpServers`, and stays silent when the key is
  absent. Do not quote session keys.
- `docs/spec/vscode-hooks.md` — replace "stays unread" with
  "is Claude user settings, opened only under `--global`".
- `README.md`:
  - CLI `--global` row (~line 189) and the `--global` section
    (~lines 260–274): add `~/.claude/settings.json` and `~/.claude.json`.
  - Coverage matrix Claude cell (~line 555):
    `--global` `~/.claude/skills`, `~/.claude/settings.json`,
    `~/.claude.json` (`mcpServers` only); unread managed policy,
    marketplace plugins.
  - Known limits (~lines 682–687): two unread Claude hook locations
    remain (managed + marketplace). User settings are `--global`. User
    MCP is `--global`, `mcpServers` only.
- `CHANGELOG.md` under `## Unreleased`: two bullets (user hooks, user
  MCP). Do not move 1.4.0. Do not invent a 1.5.0 section.
- `plans/README.md` — mark this plan DONE only after Step 5 passes.

**Verify**: `rg -n "stays unread \\(Claude user settings\\)" docs/spec/vscode-hooks.md`
returns no matches. `rg -n "Three Claude hook locations are unread" README.md`
returns no matches (that sentence is now stale).

### Step 5: Gates

```bash
bun test
bun run typecheck
bun run build
bun run spec:check
node dist/cli.js --version
```

Expected: all exit 0; version is still `1.4.0`; `STRUCTURAL_CHECKS`
length unchanged (still 103). Confirm with
`rg -c 'id: "' src/checks/registry.ts` or by not adding a registry row.

## Test plan

- New file `tests/unit/claude-global.test.ts` — the ten cases in Step 3.
- Pattern: `tests/unit/codex-mcp.test.ts` (MCP / `--global` / homedir spy)
  and `tests/unit/copilot-settings-hooks.test.ts` (user settings hooks).
- Existing Copilot / Codex / project Claude tests must stay green.
- No conformance fixture change.

## Done criteria

- [ ] `discoverClaudeUserHooks` and `discoverClaudeUserMcp` run only
      inside `if (opts.includeGlobal)`
- [ ] `~/.claude.json` without `mcpServers` produces no MCP facts and no
      `config.unreadable`
- [ ] `parseMcpFile` is never called on `~/.claude.json`
- [ ] `defaultConfig.mcpPaths` is unchanged
- [ ] No new check id; version stays 1.4.0
- [ ] `bun test`, `bun run typecheck`, `bun run build`, `bun run spec:check`
      all exit 0
- [ ] README / spec / changelog / known limits updated as in Step 4
- [ ] `plans/README.md` status row is DONE

## STOP conditions

- Live official pages no longer list `~/.claude/settings.json` as a hook
  location or `~/.claude.json` as an MCP JSON location — recapture the
  spec files and stop; do not keep the old paths.
- Live pages say user MCP now lives in `~/.claude/settings.json` (or
  hooks in `~/.claude.json`) — stop rather than reading the "wrong" key
  from the "right" file.
- Opening `~/.claude.json` would require storing or reporting non-MCP
  top-level fields to make a check work.
- A new **error** check seems necessary (it should not; existing ids
  apply).
- The change would write to the scanned tree or open a network socket on
  `check`.
- `git diff d040592 -- src/config/schema.ts` would add `~/.claude.json`
  to `mcpPaths`.
- You feel the need to honor `XDG_CONFIG_HOME` / `CLAUDE_CONFIG_DIR`
  without a quote already in `docs/spec/`.

## Maintenance notes

- Reviewers: the `mcpServers`-absent path is the defect to watch. If
  someone "simplifies" this to `parseMcpFile(join(home, ".claude.json"))`,
  `--global` will flag every Claude user as `config.unreadable`.
- Findings from these files will point at home paths. That is intended,
  same as Copilot/Codex user files. Lockfile checks stay project-scoped
  (already true for global skills).
- A later plan may open `~/.claude/agents` under `--global` the same way
  `~/.claude/skills` already is. Do not sneak it into this one.
- npm is still 1.3.0 as of this plan; publishing 1.4.0 is a separate
  handoff and is not blocked on 040, nor does 040 cut 1.5.0.
