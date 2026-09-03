# 042 — Gemini CLI and Cursor hooks

Plan 030 left a line open: "Cursor / Grok / Antigravity hook pages if they
exist." Grok landed in 1.2.0. On 2026-09-03 a cross-check of every provider's
docs found that two of the remaining products had shipped hooks since, in files
this scanner already knew about but never opened for their `hooks` key.

## The gap

| Product | File | Status before |
|---------|------|---------------|
| Gemini CLI | `.gemini/settings.json` → `hooks` | opened for `mcpServers` only |
| Cursor | `.cursor/hooks.json` | never opened |

The failure mode was **silence**, not a false positive: fixtures with real
hooks in both files scanned clean, and `README.md` recorded Gemini hooks as
`n/a`. Neither file appeared in "Deliberately unread". A typo in either — the
exact defect `hook.unknown-event` exists to catch — went unreported.

## Sources read in full

- https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- https://cursor.com/docs/hooks

Captured as [gemini-hooks.md](../docs/spec/gemini-hooks.md) and
[cursor-hooks.md](../docs/spec/cursor-hooks.md).

## STOP conditions honored

**Do not copy Claude's events onto another provider** (plan 030's rule). Both
products use their own vocabulary, and the overlap is a trap:

- Gemini `BeforeTool` is not Claude `PreToolUse`; `PreCompress` is not
  `PreCompact`. Gemini has no `Stop` or `UserPromptSubmit` at all.
- Cursor `preToolUse` is camelCase and is not Claude `PreToolUse`. The page
  documents no PascalCase spelling, so Copilot CLI's alias map must not be
  reused here.

Both therefore got their own `HookSchemaProfile`, event set, and namespaced
rule ids, and the regression tests assert that a Claude name on either file is
reported as unknown *for that provider* and never as `claude.hook.unknown-event`.

## Shape decisions, each from a quoted line

- **Gemini nests like Claude** (`{ matcher?, sequential?, hooks: [...] }`) with
  `type` **required** and `"command"` its only documented value. It routes
  through `hooksFromObject` with `nestedOnly`.
- **Cursor is flat** — "The `hooks` object maps hook names to arrays of hook
  definitions" — with `type` **optional**, defaulting to `"command"`. It gets
  its own reader (`src/discover/cursor.ts`), the same call Windsurf made:
  running a flat document through Claude's group logic would report every
  documented example as `invalid-group` or a missing required `type`.
- **`command` is required on every Cursor entry**, `type: "prompt"` included —
  the options table marks it required with no per-type exception and documents
  no separate `prompt` field.
- **`matcher` is not shape-checked on Cursor.** The options table types it
  `object` while every example passes a string. A rule cannot rest on a
  contradiction.
- **Timeouts are not recorded.** Gemini's is milliseconds, Cursor's is seconds,
  and `HookFact.timeout` documents seconds. No check reads either, so recording
  them in the wrong unit would only plant a trap.
- **`$GEMINI_PROJECT_DIR`** joins `$CLAUDE_PROJECT_DIR` and
  `$COMMANDCODE_PROJECT_DIR` in `resolveHookScript`.
- **Cursor scripts resolve against the project root**, quoted: project hooks
  "Run from the project root", and `./hooks/script.sh` "would look for
  `<project>/hooks/script.sh`". That counter-example is a test.

## Deliberately unread

Consistent with each provider's existing scope, and recorded in both captures
and `README.md`: `~/.gemini/settings.json` (Gemini's MCP side is unread under
`--global` too — opening one surface and not the other would report a user hook
as the project's problem), `/etc/gemini-cli/settings.json`, Gemini extension
hooks, `~/.cursor/hooks.json`, the Cursor MDM paths, and dashboard-synced team
hooks.

## Result

Nine checks, registry 103 → 112. `spec:check` now diffs both event sets against
the live pages and tracks all three URLs by content hash. Verbatim-official
conformance fixtures pin 4 Gemini and 15 Cursor hook facts at zero actionable
findings.

## Also fixed here

Three `tests/unit/codex-mcp.test.ts` cases failed on any machine with
`CODEX_HOME` exported: they mock `os.homedir()`, but `codexHomeDir()` correctly
prefers the env override, so the mock never applied. One preload
(`tests/helpers/env.ts`) clears `CODEX_HOME`, `GROK_HOME`, `CLAUDE_CONFIG_DIR`,
and `COPILOT_HOME` for the whole suite, covering all 33 `homedir()` mock sites
rather than the 3 that happened to break here. Tests that need one of those
variables still set and restore it themselves.
