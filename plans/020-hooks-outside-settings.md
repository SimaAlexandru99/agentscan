# Plan 020: Hooks registered outside `.claude/settings*.json`

## Status

- Priority: P2
- Effort: M
- Risk: MEDIUM — a new discovery surface, and the first hook source whose script
  paths resolve against something other than the project root
- Depends on: none (019 landed)
- Category: coverage
- Planned at: commit `c819ec2`, 2026-08-24

## Drift check

Run first: `git diff --stat c819ec2..HEAD -- src/discover/hooks.ts src/discover/shared.ts src/checks/hooks.ts`.
Stop if `hookScriptPath` or `readFrontmatter` changed shape since this plan, and
re-read both before continuing.

## Why this matters

The tool's headline claim is that it finds hooks whose scripts are gone. It reads
two files. The hooks reference lists seven places a hook can be registered:

> Where you define a hook determines its scope:
> - `~/.claude/settings.json` - All your projects
> - `.claude/settings.json` - Single project
> - `.claude/settings.local.json` - Single project
> - Managed policy settings - Organization-wide
> - Plugin `hooks/hooks.json` - When plugin is enabled
> - Skill frontmatter - The rest of the session once the skill is invoked
> - Subagent frontmatter - While that subagent is running

`src/discover/hooks.ts` reads the two project settings files. A `PreToolUse`
guard registered in a plugin's `hooks/hooks.json`, in a `SKILL.md` frontmatter
block, or in a subagent's frontmatter, whose script has been deleted, is exactly
the failure this tool exists for — and it is invisible, with no note anywhere
saying so. The 2026-08-24 audit found this gap; 019 deliberately left it.

## Spec evidence

Read 2026-08-24 from https://code.claude.com/docs/en/hooks and
https://code.claude.com/docs/en/plugins. All three shapes are quoted below and
must be recorded in `docs/spec/hook-sources.md` **before** any check ships, per
the rule in `docs/spec/README.md`.

Plugin `hooks/hooks.json` — same `hooks` object as settings, optionally
alongside a top-level `description`:

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh", "args": [], "timeout": 30 }
        ]
      }
    ]
  }
}
```

Skill and subagent frontmatter — "the same configuration format as
settings-based hooks", expressed as YAML:

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

Path placeholder, quoted:

> `${CLAUDE_PLUGIN_ROOT}`: the plugin's installation directory, for scripts
> bundled with a plugin. **Changes on each plugin update.**

Plugin layout, quoted: `hooks/` sits at the **plugin root**, never inside
`.claude-plugin/`; only `plugin.json` goes there. The plugin root is "the one you
pass to `--plugin-dir` or that contains `.claude-plugin/plugin.json`".

## Measured before writing this plan

Against 17 real `hooks/hooks.json` files installed under `~/.claude/plugins`:

| Measurement | Result |
|---|---|
| Files that parse as JSON | 17 of 17 |
| Top-level shape | `hooks` in 17; 10 also carry `description` |
| Command strings | 33 |
| Commands using `${CLAUDE_PLUGIN_ROOT}` | **31 of 33** |
| Commands using `CLAUDE_PROJECT_DIR` | 0 |
| Resolvable path occurrences | 40 |
| Of those, missing on disk | **0** |
| Entries carrying `args` | 0 (the docs example shows it; no real file used it) |

Two consequences, both load-bearing:

1. **`${CLAUDE_PLUGIN_ROOT}` is not optional.** Skip it and the check reads 2 of
   33 commands and finds nothing. It is the plugin-hook equivalent of
   `$CLAUDE_PROJECT_DIR` in settings hooks.
2. **The extraction rule is safe on real data**: 40 resolved paths, zero missing,
   so the corpus predicts no false positives — and no true ones either, which is
   the expected state of maintained plugins.

Against 798 `SKILL.md` and `.claude/agents/*.md` files across this machine's
projects and home directory: **0** declare frontmatter `hooks:`. And 0 in-tree
plugins exist across `~/projects`. Both surfaces are documented and currently
unused here, which is the same position `mcp.url-without-type` shipped in — it
fires on nothing measured and exists because the failure is silent, not because
it is common. Say that in the plan record rather than letting a future reader
mistake zero findings for zero value.

## Current state

- `src/discover/hooks.ts:112` — `discoverHooks` reads exactly
  `.claude/settings.json` and `.claude/settings.local.json`.
- `src/discover/hooks.ts:22` — `hookScriptPath` expands only
  `$CLAUDE_PROJECT_DIR` / `${CLAUDE_PROJECT_DIR}` and returns `undefined` for any
  other `$`-prefixed value. `${CLAUDE_PLUGIN_ROOT}` is refused today, correctly:
  in a settings file it has no defined base.
- `src/discover/hooks.ts:88` — `resolveHookScript` hardcodes the project root as
  the only base.
- `src/discover/shared.ts:readFrontmatter` already parses the whole frontmatter
  block into a YAML object and then reads only `name` and `description`, so
  `hooks` is one field access away from being free.
- `src/checks/hooks.ts` — `checkHookEvents` and `checkHooks` consume
  `Facts.hooks` and never ask where a hook came from, so both extend to new
  sources at no cost once the facts carry a source label.
- `HookFact` (`src/facts/types.ts:47`) has `name`, `path`, `event`, `command`,
  `scriptPath`, `scriptExists` — no field says which of the seven locations it
  came from.

## Commands

```bash
bun run typecheck        # exit 0
bun test                 # 0 fail
bun run build            # exit 0
bun run spec:check       # no drift
git diff --check         # no output
```

## Scope

In scope: `src/discover/hooks.ts`, `src/discover/shared.ts` (frontmatter `hooks`
passthrough), `src/discover/index.ts` (wiring), `src/facts/types.ts`,
`src/checks/hooks.ts` (evidence wording only), `docs/spec/hook-sources.md`,
`README.md`, and tests.

Out of scope, each for a stated reason:

- **`~/.claude/settings.json` and managed policy settings.** Not the scanned
  project's to fix, same scoping as global skills. If they are ever added it is
  behind `--global`, with a `source: global` evidence entry.
- **Marketplace plugins under `~/.claude/plugins`.** Global, and the docs say
  the install directory "changes on each plugin update". Measured: 17 plugins,
  0 broken paths. Revisit only if a user reports a broken plugin hook.
- **`monitors/monitors.json` and plugin `.mcp.json` / `.lsp.json`.** Each is
  another "config asserts a path" surface at the plugin root and each deserves
  its own plan; do not fold them in here.
- **Whether a matcher ever matches.** Same class as validating tool names —
  it needs an enumeration this repo will not hardcode.

## Steps

1. **Record the spec first.** Write `docs/spec/hook-sources.md` with the seven
   locations, the three shapes quoted above, the `${CLAUDE_PLUGIN_ROOT}`
   sentence, the plugin-root rule, the source URLs, and the read date. Add its
   row to the `docs/spec/README.md` table. No code before this file exists.

   **Verify:** `bun run spec:check` still passes; the new file names every check
   that will depend on it.

2. **Give `HookFact` a source.** Add
   `source?: "settings" | "plugin" | "skill" | "agent"` and, for plugin hooks,
   the plugin root that `${CLAUDE_PLUGIN_ROOT}` resolves against. Thread it into
   the evidence line in `src/checks/hooks.ts` so a finding says *where* the hook
   was registered — `PreToolUse @ my-plugin/hooks/hooks.json` is actionable,
   `PreToolUse` alone is not.

   **Verify:** existing hook tests pass unchanged; settings-sourced findings
   render exactly as they do today.

3. **Make script resolution base-aware.** `hookScriptPath` currently decides both
   *what the path is* and *which variables are legal*. Split the second concern
   out: pass the expansions this source defines — `CLAUDE_PROJECT_DIR` for every
   source, plus `CLAUDE_PLUGIN_ROOT` only for plugin hooks. A
   `${CLAUDE_PLUGIN_ROOT}` in a settings file must keep returning `undefined`;
   it has no base there and guessing one would be the invention this parser
   refuses.

   **Verify:** a unit test per direction — `${CLAUDE_PLUGIN_ROOT}/x.sh` resolves
   under a plugin hook and is skipped under a settings hook.

4. **Discover in-tree plugin hooks.** Find plugin roots inside the scanned tree:
   a directory containing `.claude-plugin/plugin.json`, plus the scan root itself
   when it holds `hooks/hooks.json`. Reuse the traversal bounds already proven in
   `discoverNestedClaudeSkills` — `NESTED_DISCOVERY_MAX_DEPTH`, the skip set —
   rather than writing a second walker. Read `<root>/hooks/hooks.json` through
   `readJsonConfig` so a malformed one becomes `config.unreadable` for free, and
   reuse `collectHookCommands` for the group shape, which the measurement
   confirms is identical to settings.

   **Verify:** a fixture plugin with a missing script yields one
   `hook.missing-script` naming the plugin file; a fixture whose
   `${CLAUDE_PLUGIN_ROOT}` script exists yields nothing.

5. **Discover frontmatter hooks.** Return the parsed `hooks` value from
   `readFrontmatter` (the YAML object is already in hand) and build `HookFact`s
   for skills and agents. Resolution rule, and this is the one judgement call in
   the plan: `${CLAUDE_PROJECT_DIR}` and absolute paths resolve as they do today;
   a bare relative path such as the docs' own `./scripts/security-check.sh` is
   resolved against the skill or agent's own directory **and** the project root,
   and is reported only when it is missing from both — the same two-base rule
   `skill.broken-reference` already uses. Unlike that check, this one has no
   measured corpus behind it (0 of 798 files), so the `reason` must say which
   bases were tried.

   **Verify:** a skill whose frontmatter hook points at a script in its own
   directory is silent; one pointing at a path missing from both bases reports.

6. **Document it.** README: the discovery line, the check table entry for the
   widened `hook.missing-script`, and a *Known limits* line for the sources still
   unread (user settings, managed policy, installed marketplace plugins). Note
   that `hook.unknown-event` now covers the new sources too, at no extra cost.

   **Verify:** `bun run src/cli.ts rules` and the README table agree; badges
   refreshed from the release run.

## Test plan

Temp-directory fixtures only, in the style of `tests/unit/hook-script.test.ts`
and `tests/unit/scan-cap.test.ts`. No network, no mutation of real projects.

- A plugin with `.claude-plugin/plugin.json` and `hooks/hooks.json`: one hook
  whose `${CLAUDE_PLUGIN_ROOT}` script exists, one whose script does not.
- The scan root itself as the plugin (the `--plugin-dir ./this-repo` case).
- `${CLAUDE_PLUGIN_ROOT}` in `.claude/settings.json` — must stay unresolved.
- A `SKILL.md` and a subagent file with frontmatter hooks, one resolvable at the
  skill directory, one at the project root, one at neither.
- A `hooks/hooks.json` with a top-level `description` (10 of 17 real files have
  one) and one with only `hooks`.
- An unknown event name in each new source → `hook.unknown-event`.
- Malformed `hooks/hooks.json` → `config.unreadable`, and the scan continues.

## Done criteria

- Every command in **Commands** passes with real output.
- A hook registered in any of the three new sources, pointing at a missing
  script, produces exactly one `hook.missing-script` naming the file it was
  registered in.
- No new finding appears on the three projects used as the 019 baseline
  (`touchagency` 34, `kronstadt-ehs-2026` 94, `optimad` 85) unless a real broken
  path is opened and confirmed by hand.
- `docs/spec/hook-sources.md` exists and every new assumption cites it.

## Outcome

Executed 2026-08-24. Four of the seven registration sites are now read: the two
settings files, in-tree plugin `hooks/hooks.json`, and skill / subagent
frontmatter.

Verified against a real published plugin rather than fixtures alone —
`claude-plugins-official/security-guidance` copied into a scratch project:
intact it reports nothing; delete the `sg-python.sh` its hooks launch and the
scan returns 4 errors naming `security-guidance/hooks/hooks.json`, the
`${CLAUDE_PLUGIN_ROOT}` path, and `plugin` as the source.

The 019 baseline is unchanged, as required: touchagency 34, kronstadt-ehs-2026
94, optimad 85. No project gained a finding.

One limit worth naming, unchanged from before this plan and shared by every
source: extraction names the program the command launches, so in
`bash sg-python.sh reminder.py` a missing `reminder.py` is not reported. Widening
that means deciding which arguments are scripts, which is the kind of guess this
parser refuses.

Structural note: `NESTED_DISCOVERY_MAX_DEPTH` and `NESTED_DISCOVERY_SKIP` moved
to `src/discover/shared.ts` so the skill walk and the new plugin walk cannot
drift into disagreeing about what a project contains.

## STOP conditions

- Stop before reading anything under `~/.claude` or `~/.codex`. Global hook
  sources are a separate decision and belong behind `--global`, if anywhere.
- Stop if step 5's two-base rule produces a finding on a real project that the
  maintainer cannot confirm by opening the file. With no measured corpus behind
  it, the correct response is to narrow the rule to absolute and
  `${CLAUDE_PROJECT_DIR}` paths only — not to keep a finding that might be wrong.
- Stop before adding any check that judges whether a matcher or an event will
  actually fire at runtime. This tool reports misconfiguration, not behaviour.
