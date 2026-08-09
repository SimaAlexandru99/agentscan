# Plan 009: Fix what three independent reviews found

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat ac65e54..HEAD -- src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0 — one item is a security blocker and the tool should not be
  published before it lands
- **Effort**: M (ten independent fixes, each small)
- **Risk**: LOW
- **Depends on**: none
- **Category**: security, bug
- **Planned at**: commit `ac65e54`, 2026-08-09

## Why this matters

Plans 001–008 were written by the same person who implemented them, and the
implementer was the only reviewer. Three independent reviews — a Codex pass over
the full diff, a correctness review of every check, and a production-readiness
audit — found ten defects that survived that. Every one below was **reproduced
by hand against the live CLI** before being written down here.

They fall into three groups: one leaks a credential, five state something false
about a real file, and four produce ids or numbers that are wrong.

> **How this plan came to exist twice.** The fixes were implemented once and
> lost: three review agents were dispatched with write access against the same
> working tree the author was editing, and one reset the tree to `ac65e54`
> mid-edit. The reproductions survived only because they were in the transcript.
> If you dispatch agents while editing, give them a worktree — `git worktree add`
> — or run them read-only.

## Current state

All line numbers are against `ac65e54`.

### A. BLOCKER — a parser error carries the secret into the report

`src/discover/index.ts` captures `detail: err.message` at ~14 sites; every one
reaches `checkConfigErrors` in `src/checks/index.ts:172`:

```ts
        { kind: "detail", value: err.detail },
```

Parsers quote the offending source back. Two reproduced vectors:

```bash
# .mcp.json containing an unquoted token
printf '{"K": ghp_S3CR3TCANARYabcdefghij0123456789}' > .mcp.json
agentscan check .        # → detail JSON Parse error: Unexpected identifier "ghp_S3CR3TCANARY…"
agentscan check . --json # → same, verbatim
```

```bash
# SKILL.md frontmatter with an unresolved YAML alias
printf -- '---\nname: s\nk: *ghp_S3CR3TCANARYabcdefghij0123456789\n---\n' > SKILL.md
# → Unresolved alias (the anchor must be set before the alias): ghp_S3CR3TCANARY…
```

Both leak in text **and** `--json`, which `README.md` tells users to pipe into
CI. `safe()` escapes control characters, it does not redact; JSON deliberately
bypasses it. A tool whose flagship check is `mcp.hardcoded-secret` — with the
comment *"The matched value is deliberately never echoed"* — printed one itself.

The existing tests gave false confidence: they assert no-echo only for
`mcp.hardcoded-secret` on a **well-formed** config. `grep -rn '"detail"' tests/`
returns nothing.

### B. Agents never got the guards skills have

`AgentFact` (`src/facts/types.ts`) has no `unreadable` / `unparseableFrontmatter`
fields, and `discoverAgents` drops `fm.unreadable` / `fm.unparseable`.
`checkAgents` (`src/checks/index.ts`) therefore has no equivalent of the
`continue` guards at `src/checks/index.ts:306-316`.

Reproduced — an unquoted colon in a description, the commonest YAML slip:

```
---
name: reviewer
description: Use when reviewing code: correctness, security
---
```
```
[error] config.unreadable          reviewer.md has an unexpected shape
[info]  agent.missing-description  Agent frontmatter has no `description`
```

Two findings that contradict each other. The description is on line 3. The
identical SKILL.md input correctly yields only `config.unreadable`.

### C. `.system` is reported as a skill, and the fix would delete six real ones

`discoverAgents` skips dotfiles; `discoverSkillsInDir` does not. On this machine:

```
WARN  skill:.system   Skill directory has no SKILL.md
      suggest: Add /home/simaa/.codex/skills/.system/SKILL.md or remove the directory
```

`~/.codex/skills/.system` is Codex's container: it holds `imagegen`,
`openai-docs`, `plugin-creator`, `review-agent` and two more. Following the
suggestion destroys them.

### D. `chmod 000` directory gets a false diagnosis

`existsSync` cannot distinguish ENOENT from EACCES, so an unreadable directory
that *does* contain a `SKILL.md` reports `skill.missing-skill-md`. The
file-level case is already handled correctly; only the directory case lies.

### E. A structurally wrong `package.json` is swallowed

`"dependencies": "notanobject"` yields `Stack: 0 deps` and `Summary: no
findings`. `readPackageJson` filters record fields but returns silently when the
field is present and not an object. Contradicts commit `5d8db3b`.

### F. A package name is reported as a leaked credential, at severity error

`SECRET_PATTERNS` tests `/\bsk-[A-Za-z0-9_-]{16,}/` against the whole serialized
entry, so a hyphenated slug matches:

```json
{"mcpServers": {"tk": {"command": "uvx",
  "args": ["--from", "git+https://github.com/acme/sk-mcp-server-toolkit", "run"]}}}
```
```
[error] MCP server "tk" contains what looks like a hardcoded credential (OpenAI-style key)
```

There is no credential. The finding is unfalsifiable from the report, because
the matched value is correctly never echoed. Worst possible shape for a false
positive.

### G. A wrapper key becomes a phantom server

The bare-object fallback accepts any root whose values are objects, so the VS
Code spelling `{"servers": {"db": {"command": …}}}` yields:

```
[error] MCP server "servers" declares neither command nor url
```

Both halves false, and the suggestion would break a working config.
`docs/spec/mcp.md` already flags this under "Not verified".

### H. Three subject constructions are not unique

`Finding.id` is `${ruleId}:${subject}` and `explain` uses `.find()`, so the
second of a colliding pair is unreachable.

- `hook.missing-script` — one `HookFact` per command occurrence, so the same
  guard under two matchers (the canonical shape) emits the same id twice.
  Reproduced: `2 findings / 1 unique`.
- `mcp.*` — subjects are `mcp:${server.name}` while discovery dedupes on
  `name@path`, so one name in `.mcp.json` and `mcp.json` collides. Reproduced.
- `skill.duplicate-description` — `skills:${ids.join("+")}` and `+` is legal in
  a directory name, so `{a+b, c}` and `{a, b+c}` produce one id. Also sorts with
  `localeCompare`, which is ICU-locale dependent: an id copied from CI may not
  resolve locally.

### I. `mcp.literal-env` calls `PATH` a probable secret

The heuristic is "string ≥20 chars without `${`". Reproduced on
`PATH=/usr/local/bin:/usr/bin:/bin`, `NODE_OPTIONS=--max-old-space-size=4096`,
`LOG_FORMAT=json-lines-with-timestamps` — all flagged, none a secret.

Related: the `continue` after a secret match suppresses `mcp.literal-env` for
the whole server, so a `sk-ant-…` in `args` hides a `ghp_…` in `env`. The user
rotates the key the report names and leaves the other live.

### J. The description budget counts things that are not descriptions

`checkDescriptionBudget` sums `s.id.length + description.length` over all
project skills, including directories with no `SKILL.md` — which the same report
calls "not a loadable skill". It also uses `.length` (UTF-16 units) while the
threshold and `docs/spec/thresholds.md` are stated in bytes, so a non-ASCII
project is under-measured roughly 2×. `checkLockIntegrity` counts the same
non-skills, producing `1 skills installed with no skills-lock.json` for a
project with zero skills (and no plural guard).

### L. Second wave — Codex findings, not yet reproduced by hand

The Codex pass ran after the above were confirmed and found more. These are
recorded with its evidence; **reproduce each one before fixing it**, the same
discipline the first ten got.

**Escaping has three bypasses.** `safe()` is applied in the check report but not
in `src/commands/rules.ts:48` (rule id and description printed raw — forged
lines and raw ESC confirmed), `src/cli.ts:179` (fatal errors, so a malicious
filename injects lines), or `src/commands/explain.ts:33` (the "Finding not
found: …" path writes the user's argument to stderr unescaped).

**`safe()` itself has two defects.** Truncation slices UTF-16 units, so cutting
an astral character mid-pair yields `<28>`. And the 200-character limit can drop
the very filename a finding is about: a 245-character reference is reported in
JSON but not in the text report or `explain` — the two surfaces a human reads.

**The read cap does not cap the read.** `readFileSync` loads the whole file
before `subarray`. Measured: a 128 MiB sparse `SKILL.md` took RSS from 63 MB to
194 MB. Use a length-bounded read.

**Frontmatter fence detection is wrong in two ways.** A valid block whose
closing fence falls past the 64 KB cap is reported as having no frontmatter
(reproduced at 66,045 bytes). And `indexOf("\n---")` matches any line starting
`---`, so a YAML key named `---metadata` is taken for the closing fence; a full
parser reads the block fine while the CLI emits `skill.missing-description`.

**`skillReferences` has four false negatives and two false positives.**
Missed: `./`-prefixed paths, uppercase extensions, extensions longer than four
characters, and anything after an unclosed mid-line ``` (the stripper is not
anchored to line start). Wrongly reported: `references/existing.md.backup` is
truncated at `.md` and reported as a missing `references/existing.md`, and a
path inside a URL query (`?path=scripts/x.js`) is treated as a local reference.
`~~~` and four-backtick fences are not recognised as code blocks at all.
Separately, `existsSync` accepts a *directory* named like a file, so a reference
that cannot actually be read is silently accepted.

**Agents are under-discovered and under-checked.** `.claude/agents` is walked
one level deep while Claude Code discovers definitions recursively, so
`.claude/agents/review/bare.md` is invisible. And `name` — which the agent
frontmatter does require, unlike a skill's — is never checked at all.

**More non-unique ids.** Several errors from one file all produce
`config.unreadable:config:<path>`; three invalid `package.json` fields gave
three identical ids and `explain` reached only the first. Hook-event dedupe is
by event name only, so the second settings file that needs the same fix is never
named.

**Whole-field shape errors are still swallowed** — item E covers a field that is
present-but-not-an-object; Codex confirms `string`, `array` and `null` all
return silently with no finding.

Codex confirmed two negatives worth keeping: no ReDoS in `skillReferences`
(64,993 bytes in 1.22 ms, linear), and no leak of *dropped values* from
`readPackageJson` — evidence carries only the field name and a count, as
intended.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0, no output   |
| Tests     | `bun test`          | all pass, 0 fail    |
| Fleet     | `bun run src/cli.ts check ~/projects/<name> --json` | valid JSON |

## Scope

**In scope**: `src/checks/index.ts`, `src/discover/index.ts`,
`src/facts/types.ts`, `src/facts/extract.ts`, `tests/unit/checks.test.ts`,
`tests/integration/robustness.test.ts`, `README.md`.

**Out of scope**:
- New check ids. Every item corrects an existing finding. `STRUCTURAL_CHECKS`
  must not grow, and the sync test will say so if it does.
- Symlink awareness. Real (`grep -rn "lstat" src/` → none) but a separate plan.
- The `--global` budget-scoping question raised in review: whether the byte
  budget should include global skills when `includeGlobal` is set is a product
  decision, not a defect.

## Git workflow

- Branch: `advisor/009-review-fixes`
- One commit per lettered item, conventional commits.
- **Do not dispatch write-capable agents against this working tree while
  editing.** That is how the first attempt was lost.

## Steps

Each letter is independent; land them in any order, each with its test first.

### A — redact parser detail (do this one first)

Add `safeDetail(detail: string): string` in `src/checks/index.ts` and apply it
where `err.detail` becomes evidence. Keep only a classification and the
position: `detail.split(/[:(]/)[0]` plus a `line N, column M` match if present.

Do **not** redact by token shape. That catches six known shapes and a parser can
quote any source at all; the position is the only actionable part anyway.

**Verify**: both reproductions in section A, grepped in text and `--json`
output, return zero matches. A `[unclosed` frontmatter still reports a detail
containing `line`.

### B — give agents the guards skills have

Add `unreadable?` and `unparseableFrontmatter?` to `AgentFact`, populate them in
`discoverAgents` the way `discoverSkillsInDir` does, and mirror the two
`continue` guards into `checkAgents`.

**Verify**: the section B input yields only `config.unreadable`.

### C — skip dotfiles and `node_modules` in skill directories

One condition at the top of the `discoverSkillsInDir` loop, matching
`discoverAgents`.

**Verify**: `bun run src/cli.ts check . --global` no longer names `.system`.

### D — distinguish EACCES from ENOENT

`readdirSync` the skill directory in a try/catch; on failure record an
`unreadable` `ConfigErrorFact`, set `SkillFact.unreadable`, and skip the
structural checks for that skill.

**Verify**: `chmod 000` a skill directory → `config.unreadable`, **not**
`skill.missing-skill-md`. `chmod 755` after.

### E — report a wrong-shaped dependencies field

In `readPackageJson`, when a record field is present but not an object, push an
`unexpected-shape` error rather than returning silently.

**Verify**: `{"dependencies":"notanobject"}` produces `config.unreadable`.

### F — narrow the generic `sk-` pattern

`/\bsk-[A-Za-z0-9_]{20,}\b/` — no embedded hyphens after the prefix. The
specific prefixes (`sk-ant-`, `ghp_`, `AKIA`) stay as they are.

**Verify**: `sk-mcp-server-toolkit` produces nothing; `sk-proj0123456789abcdefghij`
still reports, and still never echoes the value.

### G — require server shape in the bare-object fallback

Every value must carry at least one of `command` / `url` / `type` before the
root is treated as a server map.

**Verify**: `{"servers":{"db":{"command":"node"}}}` produces no `mcp.no-launch`.

### H — make the three subjects unique

Dedupe `hook.missing-script` on its subject with a `Set`, the same pattern
`checkHookEvents` already uses. Include the config path in `mcp:` subjects.
For `skill.duplicate-description`, sort with `<` rather than `localeCompare` and
join with a separator a directory name cannot contain (` `).

**Verify**: all three reproductions in section H give `N findings / N unique`.

### I — gate `mcp.literal-env` on the key name

`/(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL)S?$/i` on the key, instead of
value length. Same "narrow, no entropy guessing" principle `SECRET_PATTERNS`
already commits to. Also stop the secret match from suppressing the env check
unless the secret was found in an env value.

**Verify**: `PATH`, `NODE_OPTIONS`, `LOG_FORMAT` produce nothing;
`env: { API_KEY: "literal" }` still reports.

### J — count only real skills, in bytes

Filter `hasSkillMd && description !== undefined` in the budget, and
`hasSkillMd` in `projectSkills`. Use `Buffer.byteLength`. Add the plural guard
to the `skill.no-lockfile` message.

**Verify**: a project with one short-description skill and two abandoned
directories does not trip a 40-byte ceiling. 30 `é` characters count as 60.

### K — correct the README

`npm pack --dry-run --json` reports 31 files, 122008 bytes unpacked, 36721
packed. The README says 96 KB, which was never true. Fix the number and render
the Zod config error as a sentence rather than a raw issue array.

**Verify**: `grep -c "96 KB" README.md` → 0.

## Test plan

Every letter gets an assertion that fails without its fix. Two are load-bearing
beyond their own item:

- **A**: a token-shaped canary in a malformed config, asserted absent from both
  the text and the JSON output. The suite has no coverage of the `detail` path
  at all today, which is why the leak shipped.
- **H**: assert `new Set(findings.map(f => f.id)).size === findings.length` for
  each of the three shapes.

Put on-disk cases in `tests/integration/robustness.test.ts` (it has the
`project()` helper and the `chmodSync` try/finally pattern) and pure-facts cases
in `tests/unit/checks.test.ts`.

## Done criteria

ALL must hold:

- [ ] `bun run typecheck` exits 0
- [ ] `bun test` exits 0, 0 failures
- [ ] Every reproduction in "Current state" produces the corrected output
- [ ] `bun run src/cli.ts rules | wc -l` → 24 (no new ids)
- [ ] Fleet actionable count explained: expect it to **drop**, since F, G and I
      each remove a class of false positive
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `bun run src/cli.ts rules` returns anything other than 24 ids.
- A fleet count changes in a way you cannot attribute to F, G or I.
- You are tempted to redact by token shape in step A. Re-read that section.
- `git status` shows files reverting under you. Stop immediately and check
  whether an agent is writing to this tree.

## Maintenance notes

- `SECRET_PATTERNS` order is load-bearing and `sk-` is now the narrow one; a
  future prefix that is a superset of an existing one must go above it.
- The `unreadable` / `unparseableFrontmatter` guard pattern now exists in two
  places (skills and agents). A third discovered item type will need it too —
  the rule is: never make a claim about the contents of a file you failed to
  open, and say so in the check's comment.
- Reviews found ten defects in work that passed 161 self-written tests. The
  lesson is not "write more tests" — it is that the author's tests encode the
  author's assumptions. Independent review earned its place; keep it before
  every release, and give the reviewers their own worktree.
