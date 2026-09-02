# Plan 038: Make the 2026-09-02 re-verification repeatable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 661cbc4..HEAD -- scripts tests/fixtures/conformance tests/integration/conformance.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: the 2026-09-02 re-verification (`docs/spec/check-inventory.md`, commits `ed3f335`..`661cbc4`)
- **Category**: tooling, tests
- **Planned at**: commit `661cbc4`, 2026-09-02

## Why this matters

The re-verification found six checks reporting a documented, working shape as
broken. None of the seven lines could have been caught by `bun run spec:check`,
which compares only the five hook-event sets against the live pages and
otherwise checks that captures are under 90 days old. For ~30 of 36 surfaces a
vendor can add an alias, a field, a spelling, or a default and nothing here
moves until a user reports a false error.

There are two ways a capture goes wrong, and they need different defences:

1. **The page changed after capture.** A content hash per surface, compared at
   `spec:check` time, flags this for every surface, not just hook names.
2. **The line was on the page and was missed.** Only a conformance fixture
   built from the vendor's own examples catches this: the official Copilot page
   showed an `exec` handler and PascalCase event names, and the fixture had
   neither, so the scanner's rejection of both went unnoticed.

## Scope

**In scope**

- Part A — `scripts/spec-drift.ts` fetches every URL in `SPEC_SURFACES`, normalises
  the page to text, hashes it, and compares with a baseline the script owns
  (`scripts/spec-hashes.json`). A changed hash is `DRIFT`; a missing baseline
  is a `note`. `bun run spec:record` rewrites the baseline after a human has
  re-read the page and updated the capture. Normalisation and hashing are
  pure functions with offline unit tests. Network stays in the script; `check`
  is untouched.
- Part B — the conformance fixtures gain the official examples, verbatim, that
  the 2026-09-02 captures quote and that the fixtures did not contain. The
  conformance test also asserts a minimum fact count per fixture so a
  discovery regression that silently drops a file cannot make a fixture green.
- Documentation: `docs/spec/README.md` re-verification section, README release
  checklist, `CHANGELOG.md`, `plans/README.md` status row.

**Out of scope**

- Storing page text in the repository (rejected: size, churn, licences).
- New checks or new discovery surfaces (Copilot inline `.github/copilot/settings.json`
  hooks and `headers` / `auth` literal secrets are separate work).
- A new workflow: `.github/workflows/spec-drift.yml` already runs `spec:check`
  weekly and on release; Part A plugs into it.

## Steps

### Part A — content hash per surface

1. `scripts/spec-surfaces.ts`: export `normalizeSpecText(html: string): string`
   (drop `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`; keep
   `<main>` or `<article>` when present, else `<body>`; strip tags; unescape
   entities; collapse whitespace) and `specContentHash(text: string): string`
   (SHA-256, first 16 hex). Export `SPEC_HASHES_PATH`.
2. `scripts/spec-hashes.json`: `{ "<url>": { "hash": "<16 hex>", "recorded": "YYYY-MM-DD" } }`,
   keyed by URL so the two surfaces that share a URL fetch once.
3. `scripts/spec-drift.ts`: `checkSurfaceContent(report)` fetches each unique
   URL once, hashes, and pushes `DRIFT: <provider> <surface> page changed since
   <recorded> (<old> → <new>) — <url>` or `note: no content baseline for <url>
   — run bun run spec:record`. With `--record`, write the new hashes and dates
   to the JSON and exit 0 without reporting content drift. Unfetchable pages
   stay a `note`, as today. A page that normalises to under 200 characters is
   an error shell, not documentation: report it, keep the previous hash, never
   record it. `--record` writes all or nothing — if any page could not be
   hashed, leave the baseline untouched and exit 1 (review finding, 2026-09-02).
4. `package.json`: `"spec:record": "bun run scripts/spec-drift.ts --record"`.
5. `tests/unit/spec-hashes.test.ts` (offline): normalisation drops script/style
   and nav, keeps `<main>` text, is whitespace-stable; the hash is 16 hex and
   deterministic; `spec-hashes.json` parses, every key is an `https://` URL that
   appears in `SPEC_SURFACES`, and every `SPEC_SURFACES` URL has a baseline.
6. Run `bun run spec:record` once to write the baseline, then `bun run spec:check`
   and confirm `no spec drift detected`.

### Part B — verbatim official examples in conformance fixtures

Copy from the page each capture cites. Replace only token-shaped placeholders
(`ghp_xxx`, `your-token`) with obviously fake values; keep everything else
verbatim. Do not use an example that legitimately fails a check (an absolute
script path that cannot exist here).

7. `claude-json`: `.mcp.json` gains the documented `type: "http"` entry and a
   `type: "streamable-http"` entry. New `.claude/settings.json` with the
   official handler examples: command exec form (`"command": "node", "args":
   ["${CLAUDE_PLUGIN_ROOT}/scripts/format.js", "--fix"]` — no plugin base in a
   settings file, so it is skipped, not reported), HTTP hook with `headers` and
   `allowedEnvVars`, `mcp_tool` with `server` / `tool` / `input`, `prompt` on
   `Stop`, `agent` on `Stop`.
8. `copilot-hooks`: new files for the exec form (`"exec": "YOUR_EXECUTABLE",
   "args": ["YOUR_ARGUMENT"]`), the HTTP hook (`postToolUse`), the prompt hook
   (`sessionStart`), and a lifecycle file using the documented PascalCase names
   `SessionEnd`, `PostToolUseFailure`, `ErrorOccurred`, `PermissionRequest`.
9. `gemini-json`: add the `httpUrl` server and the `url` (SSE) server from the
   page, and an `env` value in the documented Windows `%VAR_NAME%` form.
10. `commandcode`: second agent file from the page's full frontmatter example
    (`tools: "*"`, `disallowedTools`, `model`, `reasoningEffort`, `maxTurns`,
    `permissionMode: plan`, `background`, `showOutput`).
11. `agent-skills`: second skill from the spec's "Example with optional fields"
    (`pdf-processing` with `license` and `metadata`).
12. `vscode-hooks`: the OS-specific example (`command` + `windows` / `linux` /
    `osx`) with the three scripts present under `scripts/` so the host-matching
    override resolves.
13. `tests/integration/conformance.test.ts`: add a `MINIMUM_FACTS` table
    (fixture → minimum `hooks` / `mcp` / `skills` / `agents` counts from
    `analyze().facts`) covering every fixture touched above, and assert it.

### Documentation

14. `docs/spec/README.md` "Re-verification": describe hash comparison,
    `spec:record`, and that a changed hash means re-read the page, update the
    capture and fixtures, then record. `README.md` release checklist step 3:
    same one-line instruction. `CHANGELOG.md` Unreleased: Added / Changed.
    `plans/README.md`: status row for 038.

## Verification

```bash
bun test                # offline; new tests included
bun run typecheck
bun run build
bun run spec:check      # network; expected: no spec drift detected
rg -n "sk-ant-|ghp_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}" tests/fixtures/conformance   # expected: no matches
```

## Done criteria

- [ ] `spec:check` reports a content hash comparison for every unique URL in `SPEC_SURFACES`
- [ ] `spec:record` rewrites `scripts/spec-hashes.json` and nothing else
- [ ] Offline tests cover normalisation, hashing, and baseline-file shape
- [ ] Every conformance fixture touched contains at least one example copied from its cited page, and stays at zero error / warning findings
- [ ] `MINIMUM_FACTS` guards the extended fixtures
- [ ] All four gates pass; no live secrets in fixtures

## STOP conditions

- `check` (or anything under `src/`) would gain a network call or a read of `scripts/spec-hashes.json`.
- A fixture example needs a check weakened to stay green.
- A page hash flaps between two consecutive fetches with no visible content change (the normaliser needs a narrower region, not a looser comparison — report it).
- Page text would be committed to the repository.

## Maintenance notes

When `spec:check` reports a changed hash: open the URL, re-read the section the
capture quotes, update `docs/spec/<file>.md` (`**Read:**` date and any new
line), extend the conformance fixture with any new official example, then run
`bun run spec:record`. A hash that changes without any relevant text change is
still recorded — the cost is one read, and the alternative is the silence that
produced the seven false positives.
