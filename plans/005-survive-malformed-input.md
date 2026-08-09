# Plan 005: A malformed project file produces a finding, never a dead scan

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8e6098d..HEAD -- src/facts/extract.ts src/discover/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/004 (so "green" means something)
- **Category**: bug
- **Planned at**: commit `8e6098d`, 2026-08-09

## Why this matters

Reproduced against the live CLI:

```
$ echo '{"name":"x","scripts":{"build":null}}' > package.json
$ agentscan check .
null is not an object (evaluating 's.includes')
$ echo $?
2
```

One `null` in a `package.json` kills the entire scan. No file path, no finding,
no partial report — a JavaScript `TypeError` printed raw. The user cannot tell
which file is at fault or that the problem is even in their project rather than
in the tool.

This directly contradicts the module's own docstring, added two commits ago:
"A package.json that will not parse is a config issue like any other." That fix
handled *syntax* errors and left *shape* errors to crash.

Two sibling readers have the same gap in a quieter form: an MCP file with an
unusable shape and an unreadable skills directory both return empty and report
nothing, so a broken config reads as a clean project — the exact failure this
tool exists to catch.

## Current state

`src/facts/extract.ts:57` — validation stops at the top level:

```ts
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({ path, kind: "unexpected-shape", detail: "package.json is not a JSON object" });
    return {};
  }
  return raw as PackageJson;
```

The `as PackageJson` asserts that `dependencies`, `devDependencies` and
`scripts` are `Record<string, string>`. Nothing checks. Two consumers then
assume `string`:

- `src/facts/extract.ts:151` — `Object.values(scripts).some((s) => s.includes("ultracite"))`
- `src/facts/semver.ts:3` via `src/rules/engine.ts:70` — `coerceVersion(range)` calls `range.trim()`

`src/cli.ts:174-178` catches the throw and prints `err.message` with exit 2 —
which is why the user sees a bare `TypeError` string.

Quieter siblings:

- `src/discover/index.ts:192` and `:213` — `parseMcpServers` returns `[]` for a
  root that is an array, or for `{"mcpServers": []}`. No `ConfigErrorFact`,
  unlike `discoverHooks` (`:395`) and `discoverSkillsLock` (`:530`), which both
  push `unexpected-shape`.
- `src/discover/index.ts:149` — `catch { return []; }` around `readdirSync` of a
  skills directory; `:507` — `catch {}` for policy files; `:471`/`:484` — the
  same in `discoverAgents`, which is not even passed an `errors` array.

Convention to follow: `readJsonConfig` (`src/discover/index.ts:49-74`) is the
model — it records `ConfigErrorFact` and returns `undefined`, and the
`config.unreadable` check (`src/checks/index.ts:116`) turns those into
`severity: error` findings.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `bun run typecheck`              | exit 0, no output   |
| Tests     | `bun test`                       | all pass, 0 fail    |
| Run it    | `bun run src/cli.ts check <dir>` | exit 0 or 1, never a raw TypeError |

## Scope

**In scope**: `src/facts/extract.ts`, `src/discover/index.ts`,
`tests/integration/robustness.test.ts`, `README.md` (Known limits, if the
behaviour note changes).

**Out of scope**:
- `src/checks/index.ts` — `config.unreadable` already renders these correctly;
  no new check id is needed.
- `src/cli.ts`'s catch-all. It stays as the last resort; this plan removes the
  reasons it fires, it does not change it.
- The `resolveRoot` behaviour of walking up to an ancestor. That is deliberate
  and already surfaced via `resolvedFrom`.

## Git workflow

- Branch: `advisor/005-survive-malformed-input`
- Conventional commits (`fix: …`). Do NOT push or open a PR.

## Steps

### Step 1: Coerce package.json record fields, reporting what was dropped

In `readPackageJson` (`src/facts/extract.ts:19`), after the top-level object
check, filter `dependencies`, `devDependencies` and `scripts` to entries whose
value is a `string`. When any entry is dropped, push one `ConfigErrorFact` with
`kind: "unexpected-shape"` naming the field and how many entries were discarded
— not their values.

Return the filtered object rather than `raw as PackageJson`, so the type
assertion becomes true instead of hopeful.

**Verify**:
```
echo '{"name":"x","scripts":{"build":null},"dependencies":{"next":15}}' > /tmp/p/package.json
bun run src/cli.ts check /tmp/p
```
→ exits 0 or 1, prints a `config.unreadable` finding naming `package.json`, and
does **not** print `null is not an object`.

### Step 2: Report unusable MCP shapes instead of returning empty

Give `parseMcpServers` the `errors` array (matching `discoverHooks`' signature)
and push `unexpected-shape` on each rejection path at `:192` and `:213` instead
of returning `[]` silently.

**Verify**: a `.mcp.json` containing `{"mcpServers": []}` produces a
`config.unreadable` finding. A valid `.mcp.json` still produces none.

### Step 3: Report unreadable directories and files

Thread the `errors` array into `discoverAgents` and push an `unreadable`
`ConfigErrorFact` in each swallowing catch: `src/discover/index.ts:149`
(skills dir), `:507` (policy file), `:471`/`:484` (agents dir).

`readFrontmatter` (`:104`) already does this correctly — match its shape.

**Verify**: `chmod 000` a skills directory, run check, confirm a
`config.unreadable` finding names it. `chmod 755` after.

### Step 4: Confirm no regression on the fleet

Run against three real projects and diff the finding counts against the
pre-change output:

```
for p in ~/projects/touchagency ~/projects/dialyx ~/projects/optimad/vreaulacurs; do
  bun run src/cli.ts check "$p" --json | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['findings']))"
done
```

Expected: identical counts to before. These projects have well-formed configs,
so this plan must change nothing about them.

**Verify**: counts unchanged.

## Test plan

Add to `tests/integration/robustness.test.ts`, which already owns this class of
case and has the `project()` helper:

- `{"scripts":{"build":null}}` → one `config.unreadable`, `severity: error`, and
  `runCheck` does not throw
- `{"dependencies":{"next":15}}` → same
- `{"scripts":{"build":"ok"}}` → no `config.unreadable`
- `.mcp.json` = `{"mcpServers": []}` → one `config.unreadable`
- unreadable skills dir → one `config.unreadable` (guard with
  try/finally `chmodSync` as the existing unreadable-SKILL.md test does at
  `tests/integration/robustness.test.ts:66-84`)

Verification: `bun test` → all pass, ≥6 new assertions.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] No input in the test suite makes `runCheck` throw
- [ ] `bun run src/cli.ts check` on a `package.json` with a null script prints a finding, not a TypeError
- [ ] Finding counts on the three real projects in Step 4 are unchanged
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Step 4 shows changed counts on a real project — this plan must be invisible on
  well-formed input; a diff means the filtering is dropping valid entries.
- You find yourself adding a new check id. `config.unreadable` covers all of
  this; a new id would need `STRUCTURAL_CHECKS` registration and is out of scope.

## Maintenance notes

- The `as PackageJson` assertion is the root pattern here: any future field read
  off `pkg` inherits the same trust. If more fields are consumed, filter them in
  the same place rather than at the point of use.
- A reviewer should check that no dropped *value* is echoed into the finding —
  only field names and counts. A `package.json` can contain a token in a script.
- Deliberately out of scope: validating `package.json` against a real schema.
  The tool reads four fields; a schema would be more machinery than the problem.
