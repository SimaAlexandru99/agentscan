# 043 — Say where every rule comes from

## The gap

112 rules, each carrying `provenance` and `lastVerified` since 1.0.0, 78 of them
resting on a verbatim quote captured in `docs/spec/` whose page is re-fetched
and hash-compared weekly by `.github/workflows/spec-drift.yml`.

None of it reached the user. A finding carried `id, ruleId, action, severity,
subject, message, reason, evidence, suggest` — and nothing else. Not in the
report, not in `explain`, not in `--json`, not in `agentscan rules`, which read
`provenance` off each entry (`src/commands/rules.ts:29`) and discarded it. The
npm package ships `["dist", "README.md", "CHANGELOG.md", "LICENSE"]`, so
`docs/spec/` never reached a user either.

So `cursor.hook.unknown-event` — 21 event names quoted from a page checked every
Monday — and `cursor.hook.missing-script` — an inference of ours — rendered
identically as `ERROR`. A reader who did not already know the vendor docs could
not tell them apart. Evidence that cannot be exported is, to a sceptic,
indistinguishable from no evidence.

Two defects fell out of the same root:

- `README.md` claimed *"Each registry entry carries `provenance` … `agentscan
  rules` lists them all."* It did not. The documentation was false.
- The hand-maintained README rule table had 109 of 112 rows. The three
  `windsurf.hook.*` rules from #13 were never added, and nothing noticed for a
  release.

## What shipped

`StructuralCheck` gains a **required** `source`:

```ts
type RuleSource =
  | { kind: "spec"; url: string; capture: string }
  | { kind: "derived"; detail: string };
```

Required is the load-bearing word. A new rule that cannot say where it came from
does not compile — the one guarantee a convention cannot give.

`make()` (`src/checks/make.ts`) is the single choke point every structural and
budget check passes through, so provenance is attached there and all five
renderers get it without five lookups. It throws on a registry miss: the
declared-equals-emitted test (`tests/unit/checks.test.ts:1930`) already makes
that impossible, and a finding that cannot account for itself is precisely what
this change exists to abolish.

No import cycle: `registry.ts` imports one type from `provenance.ts`, which
imports nothing. `make.ts → lookup.ts → registry.ts` is a DAG. If anyone ever
makes `registry.ts` import a check module, `BY_ID` initialises against a TDZ'd
array and produces an empty map rather than a crash — the fix then is a lazy
map inside `checkById`, not moving the lookup out of `make()`.

## The 112 sources: 95 spec, 17 derived

Bootstrapped from the `**Depends on it:**` / `**Source:**` / `**Read:**` lines
the captures already carry, then reviewed. Deliberate picks:

- `agent-skills.skill.*` cite `agent-skills.md` — the spec itself — not the four
  provider captures that only record adopting it.
- `claude.hook.unknown-event` cites `hook-events.md`, which holds the 33-name
  list, not `hook-sources.md`, which also claims it.
- **`mcp.command-missing`, `security.hardcoded-secret` and
  `mcp.literal-credential` are `derived`, not Claude's MCP page.** They fire on
  Windsurf, Grok, Cursor and Codex files, and `docs/spec/mcp.md` calls them
  judgements in its own words: *"`mcp.command-missing` is an
  internal-consistency check"*, *"judge whether an entry is misconfigured"*.
  Printing `code.claude.com/docs/en/mcp` to a Cursor user would be exactly the
  confusion this change removes. `mcp.literal-env` stays `spec` — the page does
  document `${VAR}` indirection, which is what the rule looks for the absence of.
- `budget.agents-md` is `derived`. `thresholds.md` backs it with blog posts and
  says the official page states no line budget; a blog must never render as a
  vendor spec.

Provenance and source are orthogonal axes, deliberately. `skill.missing-skill-md`
prints `internal-consistency · agentskills.io/specification` — the label says how
strong the inference is, the source says which page informed it.

## The property worth the work

`tests/unit/rule-sources.test.ts` asserts every cited URL is in `SPEC_SURFACES`.
All 28 already were. So **every source a user reads is a page `spec:check`
re-fetches and hash-compares**, and a vendor rewriting it fails CI instead of
quietly turning a quoted rule into a false positive. Without that test the URLs
are decoration; with it they are a chain a reader can pull.

The same file asserts the capture exists, that it names the rule (catching a URL
that is plausible but wrong), that `lastVerified` equals the capture's
`**Read:**` date, and that a `spec-required` rule cannot claim it has no source.

That last date check found real rot: **54 rules claimed a `lastVerified` older
than the capture they rest on** — the 2026-09-03 re-read never reached the
registry. Synced, and now held in step by the test.

## README generation

`scripts/readme-rules.ts` rewrites the table between markers from the registry.

It **preserves** each row's `Severity` and `Catches` cell rather than printing
`check.description`, for two reasons found while building it: severity is
per-finding, not per-rule (`claude.agent.invalid-name` emits both `warning` and
`error`), and 101 of 109 rows carry prose materially richer than the registry
one-liner. Generating from `description` would have traded a drift bug for a
worse README. So the README owns the prose and the severity; the registry owns
the id set, provenance and source; the script enforces the split, and
`tests/unit/docs-sync.test.ts` fails the build on drift.

`docs-sync` also asserts the check count in all four hand-written places.
`site/lib/site.ts` was still at 103 while the other three had been fixed by
hand in the same change — four copies of one integer is not a job for people.

## Deliberately not done

- **A `lastVerified <= SPEC_SURFACES.lastVerified` test.** It has teeth (11 hits
  today, all Claude pages) but passing it means bumping surface dates to claim
  re-reads nobody performed. A date you did not earn is worse than a stale one.
  Reconcile `SPEC_SURFACES` against the captures in a separate pass.
- **Migrating README prose into `registry.description`.** It would give one
  source of truth and a better `agentscan rules`, but it is a 101-row prose
  migration and does not belong in the same change as the source fill.
- **A GitHub URL for `capture:`.** `explain` prints the relative path;
  synthesising a blob URL would hardcode repo and branch into `src/` and rot.
