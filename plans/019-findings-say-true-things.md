# Plan 019: Findings say true things — fix the audit's confirmed defects

## Context

The 2026-08-24 audit of `agentscan` v0.5.0 verified every spec claim against live
Claude Code documentation (context7 `/websites/code_claude` + direct fetches of
`docs/en/hooks`, `docs/en/mcp`, `docs/en/skills`, `docs/en/sub-agents`). All of
them held: the 31 hook events match exactly, the `url`-without-`type` quote in
`docs/spec/mcp.md` is verbatim from the live page, and deleting
`skill.name-mismatch` / `skill.missing-name` was correct. Gates are green
(`typecheck` exit 0, `bun test` 226 pass, `build` exit 0, `spec:check` no drift).

What the audit did find is two scoring-grade **false positives** reproducible on
real projects, plus documentation that no longer matches the code — in a repo
whose entire selling point is that every finding is true and every check is
sourced.

| Reproduced on | Effect |
|---|---|
| `~/projects/touchagency` | 4 of 12 errors false → score 0/100 |
| `~/projects/kronstadt-ehs-2026` | 4 of 6 errors false → score 40/100 |
| `~/projects/optimad` | 3 false errors + 29 false warnings → score 0/100 |

Outcome intended: a scan of those three projects reports only defects that are
real, and README / `plans/README.md` / `docs/spec/` describe the code as it is.

## Status

- Priority: P0 (the tool is wrong about real projects)
- Effort: M
- Risk: LOW — additive checks, two grouping-key changes, no new discovery surface
- Depends on: none
- Category: bug + docs

## Drift check

Run first: `git log --oneline -3` and `bun test`. Stop if the suite is not 226
pass / 0 fail, or if `src/discover/shared.ts:readFrontmatter` has changed shape
since the audit.

## Decisions already taken

- Over-cap files get a **new `info` rule `scan.truncated`**, not silence and not
  an error. Check count goes 26 → 27.
- `agent.invalid-name` drops from `error` to `warning`, and gains a spec file.
- Hook coverage beyond `.claude/settings*.json` (plugin `hooks/hooks.json`, skill
  and subagent frontmatter hooks) is **out of scope** — file it as plan 020.

## Scope

In scope: `src/facts/types.ts`, `src/discover/shared.ts`, `src/discover/policy.ts`,
`src/checks/config.ts`, `src/checks/registry.ts`, `src/checks/skills.ts`,
`src/checks/agents.ts`, `src/report/text.ts`, `src/checks/make.ts` (comment),
`action.yml`, their tests, `README.md`, `plans/README.md`, `docs/spec/`.

Out of scope: new hook sources, `mcp.*` behavior, the score formula, the 64 KB
and 100 KB caps themselves, anything under `site/`.

---

## A. A file over the scan cap is not broken config

**Defect.** `src/discover/shared.ts:161-164` pushes a config error and returns
*before* parsing frontmatter that sits in the first 300 bytes. Every
`ConfigErrorFact` becomes `config.unreadable` at severity **error**
(`src/checks/config.ts:26`) with the message *"has an unexpected shape — its
contents are invisible to the scan"* and the reason *"whatever it configured is
simply not in effect"*. Both are false: Claude Code loads the file. Reproduced
with `~/projects/touchagency/.claude/skills/hallmark/SKILL.md` — 67,444 bytes,
1.9 KB over the cap, valid frontmatter on line 2. `src/discover/policy.ts:21`
has the same shape for `AGENTS.md` / `CLAUDE.md` over `POLICY_CAP`.

**Steps**

1. `src/facts/types.ts:80` — add `"truncated"` to the `ConfigErrorFact.kind` union.
2. `src/discover/shared.ts:161-164` — keep the push, change its `kind` to
   `"truncated"`, and **delete the `return`** so parsing continues over the
   64 KB prefix. Leave the later `frontmatter not closed within the first N
   bytes` branch (line ~181) as `unexpected-shape`: that one is genuinely
   unknowable and stays an error. A file can now emit both, which is honest.
3. `src/discover/policy.ts:21` — same `kind` change.
4. `src/checks/config.ts` — in the `configErrors` map, branch on
   `err.kind === "truncated"` and emit through the existing `make()` helper:
   `ruleId` `scan.truncated`, `action: "warn"`, `severity: "info"`, message
   naming the file and the cap, reason stating that the file is valid and only
   a bounded prefix was read so body checks (`skill.broken-reference`, policy
   line counts) may undercount. Reuse `safeDetail()` for the subject so ids stay
   unique per file+kind.
5. `src/checks/registry.ts` — add the `scan.truncated` entry (the
   `declared ids and emitted ids are the same set` test fails in both directions
   otherwise).

**Tests**

- `tests/unit/checks.test.ts:831` sync fixture — add a `configErrors` entry with
  `kind: "truncated"`.
- New fixture test (mirror the temp-dir style of `tests/unit/hook-script.test.ts`):
  a `SKILL.md` of `SKILL_MD_CAP + 1` bytes with valid frontmatter yields exactly
  one `scan.truncated` at `info`, **no** `config.unreadable`, and its
  `description` is still extracted.

**Docs**

- `README.md` — badge `checks-26` → `checks-27`; the `26 checks · 4.1k lines`
  line; add the row to the check table; extend *Known limits* to say the cap is
  now reported rather than silent.
- `docs/spec/README.md` — add `scan.truncated` to *What is not spec-backed*.

---

## B. Sibling projects in a monorepo are not one skill namespace

**Defect.** `discoverNestedClaudeSkills` (`src/discover/skills.ts`) flattens every
nested `.claude/skills` under the scan root into one list, and two checks then
reason as if a single session loaded all of them:

- `checkDuplicateDescriptions` (`src/checks/skills.ts`) keys only on
  `"claude"` / `"agents"`, so `optimad-calificari/.claude/skills/accessibility`
  and `vreaulacurs/.claude/skills/accessibility` collide → 29 warnings, 87 points,
  on skills that never compete in the same session.
- `checkDescriptionBudget` sums all 145 skills across three sub-apps into one
  startup budget no runtime ever experiences (`info`, so free, but untrue).

**Root cause is shared**: the owning skills root is already known —
`dirname(skill.path)` — and neither check uses it.

**Steps**

1. `checkDuplicateDescriptions` — import `dirname` from `node:path`; replace the
   `namespace` derivation with `dirname(skill.path)` in the group key. Strictly
   more precise: `.claude/skills` and `.agents/skills` in the same project remain
   separate exactly as today.
2. `checkDescriptionBudget` — group the filtered project skills by
   `dirname(s.path)` and emit one finding per over-budget root. Keep the subject
   `skills:description-budget` when there is exactly one root so existing
   `ignoreFindings` ids stay valid; use
   `skills:description-budget:<root relative to project>` only when more than one
   root is present.

No type or discovery changes. The `skill()` test helper defaults to
`.agents/skills/<id>`, so every existing test keeps one shared root and stays green.

**Tests**

- Two skills with one description under two different `.claude/skills` roots →
  no finding; the same two under one root → still one finding.
- Two roots each under the ceiling but summing over it → no finding; one root
  over it → one finding naming that root.

---

## C. `agent.invalid-name` matches what the docs actually claim

`docs/en/sub-agents` states the format ("Unique identifier using lowercase
letters and hyphens") but names a load failure only for `:`
("Claude Code doesn't load a file whose name contains one"). Severity `error`
means *this does not work*, which the docs do not support for
`name: SEO Specialist`.

**Steps**

1. `src/checks/agents.ts` — `agent.invalid-name` severity `error` → `warning`;
   reason cites the format line and `docs/spec/agents.md`.
2. New `docs/spec/agents.md`, in the format of the existing spec files:
   source `https://code.claude.com/docs/en/sub-agents`, read `2026-08-24`, the
   `name` and `description` quotes and the `:` load-failure quote, and
   *Depends on it:* the five `agent.*` checks.
3. `docs/spec/README.md` — add the row; the `agent.*` checks currently appear in
   neither the table nor the not-spec-backed list.
4. `README.md` — severity cell for `agent.invalid-name` → warning.
5. Assert the new severity in `tests/unit/checks.test.ts` (the sync fixture
   already carries `frontmatterName: "Bad Name"`).

---

## D. The report prints the ids it tells people to paste

`src/checks/make.ts` calls the id "what the report prints"; the text report never
prints it, even with `--verbose` (grep: 0 occurrences). README claims
`ignoreFindings` takes *"the value you already have from reading the report"* —
you do not have it, and `explain` needs the id you cannot see.

**Steps**

1. `src/report/text.ts` — thread the existing `verbose` flag into `formatGroup`
   and, when set, emit one dim `id: <finding.id>` line per finding (through
   `safe()`, like every other interpolated value).
2. Fix the `make.ts` comment and the README `ignoreFindings` paragraph to name
   `--verbose`, `--json` and `explain` as the sources.
3. Test in `tests/unit/report.test.ts`: id line present with `verbose`, absent
   without.

---

## E. Documentation matches the tree

1. `plans/README.md` — 011, 012, 015, 017 are implemented but marked TODO.
   Evidence: `statSync(abs).isFile()` plus the directory regression at
   `tests/unit/hook-script.test.ts:113` (012); `action.yml` passing every input
   through validated env vars (011); `NESTED_DISCOVERY_MAX_DEPTH` in
   `src/discover/skills.ts` (015); `AGENTS.md` present (017). Confirm each with
   `git log --oneline -- <path>` and set DONE with the commit ref. Re-assess
   013/014 against `tests/integration/{cli,action,public}-contract.test.ts` and
   the `dist/cli.js` smoke step in `.github/workflows/ci.yml`.
2. `README.md` — the check table lists 22 rows and omits every `budget.*` id
   while the prose says *"The five `budget.*` entries at the bottom"*; there are
   four (`agents-md`, `claude-md`, `agents`, `mcp`) — `skill.description-budget`
   is a `skill.*` id. Add the four rows, fix the count, refresh the badges for
   the new check and test totals from the final run.

---

## F. Action output delimiter (do last)

`action.yml` writes `report<<AGENTSCAN_EOF` into `$GITHUB_OUTPUT` with a fixed
delimiter over content derived from scanned files. Not currently reachable —
`safe()` escapes newlines in human output and `JSON.stringify` escapes them in
`--json` — but a per-run random delimiter is the standard hardening and costs two
lines. `tests/integration/action-contract.test.ts:99-102` asserts the literal
string, so switch that assertion to a pattern.

---

## Verification

Run all of these and show output with exit codes:

```bash
bun run typecheck                    # expect exit 0
bun test                             # expect 0 fail; note the new total for the badge
bun run build && node dist/cli.js --version   # expect 0.5.0
bun run spec:check                   # expect "no spec drift detected"
bun run src/cli.ts rules | wc -l     # expect 27
bun run src/cli.ts check .           # dogfood: expect clean
```

End-to-end, on the projects that reproduced the defects:

```bash
bun run src/cli.ts check ~/projects/touchagency --verbose
bun run src/cli.ts check ~/projects/kronstadt-ehs-2026 --verbose
bun run src/cli.ts check ~/projects/optimad --verbose
```

Expected changes:

- No `config.unreadable` on `hallmark/SKILL.md` or `design-taste-frontend/SKILL.md`
  in any of the three; each instead shows `scan.truncated` at `info` (hidden
  without `--verbose`).
- `optimad` loses all 29 cross-project `skill.duplicate-description` warnings and
  keeps only same-root collisions, if any.
- `agent.invalid-name` appears as `WARN`, not `ERROR`, in all three.
- Scores rise from 0/40/0; record the new numbers and confirm each remaining
  finding by opening the file it names.

## STOP conditions

- Stop if removing the truncation early-return makes any existing test fail in a
  way that is not the fixture change in step A — that means the cap is load-bearing
  somewhere this plan did not trace.
- Stop before touching hook discovery sources; that is plan 020.

## Outcome

Executed 2026-08-24. Measured before and after on the three projects that
reproduced the defects:

| Project | Before | After |
|---|---|---|
| touchagency | 0/100, 12 errors | 34/100, 6 errors — all six real missing hook scripts |
| kronstadt-ehs-2026 | 40/100, 6 errors | 94/100, 0 errors |
| optimad | 0/100, 5 errors + 30 warnings | 85/100, 5 warnings |

`optimad` keeps two `skill.duplicate-description` warnings, and both are real:
`composition-patterns` and `vercel-composition-patterns` live in the same
`vreaulacurs/.claude/skills` directory with identical descriptions, so one
session does see both.
