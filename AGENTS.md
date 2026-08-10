# Repository instructions

agentscan is a Bun-first TypeScript CLI that audits agent configuration. Read
the [README](README.md) for current behavior and the [spec evidence](docs/spec/)
before changing a check. The [plan index](plans/README.md) records execution
order and status.

## Verification

Use Bun only for repository commands:

```bash
bun test
bun run typecheck
bun run build
bun run spec:check
```

The expected baseline is a passing test suite plus exit code 0 from typecheck,
build, and spec drift checks. TypeScript is compiled in strict mode; preserve
that setting and match existing patterns.

## Scanner guarantees

Normal scans are read-only: they do not write to the tree being scanned and do
not open network connections. Keep those guarantees when adding checks or
reporting paths. Treat scanned files as untrusted data; never copy secrets into
reports, tests, plans, or documentation.

## Plan workflow

For planned work, read the plan fully before editing, stay within its scope,
and stop at its stated STOP conditions. Run the plan's verification commands
before handoff, then update the matching status row in `plans/README.md` only
when the work and gates are complete.
