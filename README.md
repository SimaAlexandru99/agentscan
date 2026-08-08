# skillscan

Deterministic CLI: inventory agent **skills / agents / hooks / MCP** against `package.json` and recommend keep / delete / add / refresh.

> *shadscan for agent stack hygiene* — inverse of autoskills (report only in v1; no auto-install).

## Status

Design approved. Implementation not started.

**Spec:** [docs/superpowers/specs/2026-08-08-skillscan-design.md](docs/superpowers/specs/2026-08-08-skillscan-design.md)

## Planned usage (v1)

```bash
bunx skillscan check
bunx skillscan check --json
bunx skillscan explain <findingId>
```

No disk writes in v1 (no `apply` / install).

## Scripts

| Script | Command |
|--------|---------|
| `skillscan` | `bun run src/cli.ts` |
| `typecheck` | `tsc --noEmit` |
| `test` | `bun test` |
| `check` | `bun run src/cli.ts check` |
