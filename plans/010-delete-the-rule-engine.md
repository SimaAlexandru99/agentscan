# 010 — Delete the YAML rule engine

Status: done. Output-neutral, verified byte-identical on 21 projects.

## What was there

`src/rules/` — 709 lines across `engine.ts` (581), `load.ts` (75), `schema.ts`
(34), `glob.ts` (19) — plus five YAML rule files under `src/rules/builtin/`, two
test files, a `--rules-dir` flag, and a documented "How to add a rule" section
in the README describing eight `when` matchers.

Its purpose was user extensibility: drop a YAML file in `.agentscan/rules/` and
the tool gains a check.

## The measurement

Across 21 real projects the entire subsystem produced **9 findings**:

| ruleId | findings |
|--------|----------|
| `budget.agents-md` | 7 |
| `budget.mcp` | 1 |
| `budget.agents` | 1 |
| `budget.claude-md` | 0 |
| `policy.package-manager-drift` | 0 |

All `info`. The other 68 findings came from `src/checks/`.

Two rules never fired at all. Three of the eight matchers (`dep` with semver,
`skillMatches` with globs, `hasConfig`) and the `not` combinator were used by no
builtin rule — they existed only for hypothetical user rules.

## Why deleting beat shrinking

The plan of record was to shrink the engine to a threshold evaluator. Reading it
changed that:

1. **The extension point had no dependents.** Every matcher a builtin used
   (`count`, `policyLines`, `packageManager`, `policyMatches`) is trivially
   expressible in code. Every matcher worth extending with (`skillMatches`,
   `not`, `dep`) had zero builtin users. Shrinking would have deleted exactly
   the half that made the feature a feature.

2. **The concrete user need was already met elsewhere.** The realistic custom
   rule is "our team's CLAUDE.md must be under 100 lines" — and `thresholds` in
   `.agentscanrc.json` already does that, with no YAML. The engine's remaining
   value was speculative.

3. **Publishing would have frozen it.** A YAML schema shipped in v0.1 is a
   public API. Removing a matcher afterwards is a breaking change; nobody has
   written a rule yet, so this was the last cheap moment.

4. **It was surface area for wrong findings.** `when` is opaque JSON — a typo
   like `depp:` for `dep:` silently produced a rule that never matched, and the
   README had to warn about it. On a tool whose stated first priority is not
   reporting false things, an extension point that fails silently is a liability.

If someone asks for custom rules, they come back in v0.2 designed against a rule
that person actually wanted, rather than five invented to justify an engine.

## What replaced it

`src/checks/budgets.ts` (189 lines) holds all five rules as code, and
`src/checks/make.ts` holds the finding constructor both check modules now share.
The five ids joined `STRUCTURAL_CHECKS`, so the bidirectional sync test covers
them — it failed on the first run, as designed, because the fixtures were too
small to trigger a budget.

Output is **byte-identical**, deliberately: same ids (including the odd-looking
`budget.mcp:rule:budget.mcp` subjects the engine generated), same messages,
reasons, suggestions, evidence order, and severities.

## Verification

```
21/21 projects: JSON output identical before and after
tsc --noEmit: exit 0
tests: 183 pass / 0 fail
```

Net: −709 lines of engine, −5 YAML files, −2 test files, −1 CLI flag, −60 lines
of README, +226 lines of checks.

## Removed public surface

- `--rules-dir` flag
- `.agentscan/rules/` user rule directory
- `Analysis.rules`, `AnalyzeOptions.rulesDir`, `RulesCommandOptions.rulesDir`

`ignoreRules`, `ignoreFindings`, `thresholds`, and `agentscan rules` all keep
working unchanged — `agentscan rules` now prints one list instead of two halves.
