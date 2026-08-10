# Plan 011: Harden GitHub Action shell boundaries

> Executor: follow each verification gate. Modify only the files in Scope.

## Drift check

Run first: `git diff --stat feff905..HEAD -- action.yml`. If it is non-empty, compare the current Action step with this plan before proceeding; stop on a contract mismatch.

## Status

- Priority: P1
- Effort: S
- Risk: MED
- Depends on: none
- Category: security
- Planned at: commit `feff905`, 2026-08-10

## Why this matters

`action.yml` interpolates Action inputs directly into generated Bash. A caller-controlled value can change the shell program before Bash constructs the argument array. The Action is intended to run in CI, where this can expose repository contents or the job token.

## Current state

- `action.yml:68-75` embeds `inputs.path`, `fail-on`, `output`, `fail-under`, `global`, and `github.action_path` inside `run: |`.
- The intended CLI contract is `check <path> --fail-on <level> --output <format>`, with optional `--fail-under` and `--global`.
- Bash arrays and `set +e` are intentional because finding exit codes are Action results.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `bun test` | 201+ pass, 0 fail |
| Diff hygiene | `git diff --check` | no output |

## Scope

In scope: `action.yml` and the existing test/contract surface only if needed to verify the shell boundary.

Out of scope: CLI parser redesign, public input names, Bun setup, or report format.

## Steps

1. Add an `env:` mapping for every input and the trusted action path. In Bash, read only quoted shell variables and append them to `args`; do not place `${{ inputs.* }}` inside `run:`. Preserve the optional argument conditionals.
2. Validate `fail-on`, `output`, `global`, and non-empty `fail-under` before invoking Bun. Invalid values exit 2 with a clear message.
3. Leave runtime contract coverage to Plan 013; this plan must at minimum add a static guard that fails if a future `run:` block directly interpolates an input.

**Verify after Step 1:** `rg -n '\$\{\{[[:space:]]*inputs\.' action.yml` finds only the `env:` mapping, never the Bash body.

**Verify after Step 2:** exercise each invalid value through the contract guard and confirm the scan command is not invoked.

**Verify after Step 3:** `bun test` includes the static guard and remains green.

## Test plan

Use a deterministic YAML/text contract test for `action.yml`: assert every input is mapped through `env`, the Bash body consumes quoted variables, and no direct input expression occurs in `run:`. Plan 013 owns subprocess coverage of the built CLI and Action argument contract.

## Done criteria

- [ ] No untrusted Action input is interpolated into Bash source.
- [ ] Valid inputs preserve current CLI arguments and exit behavior.
- [ ] Invalid fixed-choice inputs fail before scan execution.
- [ ] Typecheck and tests pass.

## STOP conditions

Stop if the test requires a live GitHub runner or changing the public input contract.

## Maintenance notes

Every new Action input must be added to `env:` and consumed as a quoted variable; never interpolate it directly into `run:`.
