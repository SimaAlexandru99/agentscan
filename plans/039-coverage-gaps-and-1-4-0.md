# Plan 039: Close two coverage gaps, then release 1.4.0

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git status` on `master` at the commit this
> plan was written against. Do not invent a third coverage gap.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 038 (DONE) and the #13 Windsurf merge (`569a332`)
- **Category**: discovery, security, release
- **Planned at**: commit `569a332`, 2026-09-02

## Why this matters

The 2026-09-02 re-verification and plan 038 left two documented surfaces unread
on purpose:

1. **Copilot CLI inline settings hooks.** Official hooks-reference and
   CLI config-dir pages register hooks in `.github/copilot/settings.json`,
   `.github/copilot/settings.local.json`, and `~/.copilot/settings.json`.
   A missing script in one of those files is invisible today.
2. **Literal credentials under MCP `headers` / `auth`.** `mcp.literal-env`
   inspects `env` only. Cursor documents OAuth secrets under `auth`;
   Windsurf and Grok document `headers`. A committed `auth.CLIENT_SECRET`
   or `headers.API_KEY` is the same failure class as a literal `env` value
   and is currently silent unless the value happens to match a token regex.

Unreleased already holds the re-verification, plan 038, and #13. This plan
closes the two gaps and cuts **1.4.0**.

## Scope

**In scope**

- Part A — discover Copilot CLI inline `hooks` from project settings and,
  under `--global`, user settings. Source `"copilot-settings"`. Reuse
  existing `copilot.hook.*` checks (`schemaProfile: "copilot-cli"`).
- Part B — `mcp.literal-credential` on `headers`, `http_headers`, and `auth`
  string maps. Field paths in findings; values never echoed. Treat Grok
  `{{var}}` as interpolation.
- Part C — bump to 1.4.0 in the seven version sites, move Unreleased into a
  dated section, refresh counts, write this plan's status row.
- Tests and spec captures for A and B.

**Out of scope**

- Dual-parsing `.claude/settings.json` as Copilot. That file stays on the
  Claude profile (required `type`, nested groups). Copilot docs list it as
  a cross-tool location; applying the Copilot schema would false-positive
  valid Claude hooks.
- Policy hooks (`/etc/github-copilot/policy.d`), plugin `hooks.json`,
  machine admin files.
- Opening credential stores (`auth.json`, `mcp-tokens.json`).
- New hook check ids. Existing `copilot.hook.*` apply once facts exist.
- npm publish and the GitHub Release UI (handoff).

## STOP conditions

- A new **error** check cannot cite a published line (security provenance
  is allowed for Part B, matching `mcp.literal-env`).
- The change would write to the scanned tree or open a network socket on
  `check`.
- `.claude/settings.json` would be parsed twice or remapped to Copilot.

## Steps

### Part A — Copilot inline settings hooks

1. Add `copilot-settings` to `HookFact.source`.
2. `discoverCopilotSettingsHooks(root)` reads
   `.github/copilot/settings.json` and `.github/copilot/settings.local.json`.
   Extract top-level `hooks`. Always `schemaProfile: "copilot-cli"` (the
   settings file is Copilot CLI config; it does not need `version: 1`).
   Source `"copilot-settings"`, `sourceProvider: "vscode"`.
3. `discoverCopilotUserSettingsHooks` reads `$COPILOT_HOME/settings.json`
   or `~/.copilot/settings.json` only when `includeGlobal` is true.
   Honor `COPILOT_HOME` for user hook files as well (`$COPILOT_HOME/hooks`),
   which the capture already quotes.
4. Wire project discovery into the ancestor loop in `discover/index.ts`
   and the user variant under `if (opts.includeGlobal)`.
5. Same-event hooks from settings and `.github/hooks` coexist — do not
   add shadowing. Official line: all sources run.
6. Tests: project settings + local settings; missing script;
   `--global` user settings; `COPILOT_HOME`; `.claude/settings.json`
   remains Claude. Conformance: add
   `tests/fixtures/conformance/copilot-hooks/.github/copilot/settings.json`
   with the documented inline `hooks` object; bump `MINIMUM_FACTS`.
7. Update `docs/spec/copilot-hooks.md`, `hook-sources.md`, README matrix,
   hook location table, `--global` copy, and the known-limits bullet.

### Part B — `mcp.literal-credential`

1. `McpFact.literalCredentialFields?: string[]` — field paths such as
   `headers.API_KEY`, `auth.CLIENT_SECRET`, `http_headers.Authorization`.
   Never store values.
2. Discovery walks `headers`, `http_headers`, and `auth` objects. A string
   value is literal when it is non-empty, does not match interpolation,
   and the key is secret-named (`TOKEN` / `SECRET` / `KEY` / `PASSWORD` /
   `PASSWD` / `CREDENTIAL`, same suffix as `mcp.literal-env`) or is
   `Authorization` / `Proxy-Authorization`.
3. Extend both `INTERPOLATED` regexes with `{{var}}` (Grok headers).
4. Registry id `mcp.literal-credential`, provenance `security`, warning.
   Message and evidence list field paths only.
5. `security.hardcoded-secret` still wins when a token pattern matches
   (existing `continue`). Both `mcp.literal-env` and
   `mcp.literal-credential` may fire on the same server otherwise.
6. Sync-test fact with a non-token literal under `auth`. Unit tests for
   interpolated vs literal headers, Grok `{{session_id}}`, `%VAR%`, and
   "value never echoed".
7. Quote the lines in `docs/spec/mcp.md`, `cursor-mcp.md`, `grok-mcp.md`,
   `windsurf-mcp.md`. README row. Check-inventory addendum.

### Part C — release 1.4.0

1. Bump `package.json`, `src/version.ts`, README badges / sample version /
   coverage heading / Releases paragraph, `CHANGELOG.md`,
   `site/lib/site.ts` (`PRODUCT_VERSION`, `PRODUCT_CHECKS`),
   `site/PRODUCT.md`.
2. Counts come from `STRUCTURAL_CHECKS.length` and `bun test` after A+B.
3. Move Unreleased into `## 1.4.0 — 2026-09-02` (plus A+B). Leave a
   fresh empty Unreleased.
4. `plans/README.md` status row. This file's status stays accurate.
5. Gates: `bun test`, `bun run typecheck`, `bun run build`,
   `bun run spec:check`, and the site test file that pins version/checks.
6. Merge `--no-ff` to `master`, tag `v1.4.0`, push tag. Delete the
   feature branch. GitHub Release + npm publish are handoff.

## Verification

```bash
bun test
bun run typecheck
bun run build
bun run spec:check
```

Expected: all four exit 0. New tests cover both gaps. Conformance
`copilot-hooks` stays clean and meets the raised floor. `node dist/cli.js
--version` prints `1.4.0`.

## Handoff

GitHub Release from the 1.4.0 changelog section, then `npm publish`.
This executor does not publish.
