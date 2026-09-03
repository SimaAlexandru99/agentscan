# Cursor project rules

**Source:** https://cursor.com/docs/rules
**Read:** 2026-09-03
**Depends on it:** `cursor.rule.too-large`, `.cursor/rules/**/*.mdc` discovery

## Location and extension

Quoted:

> Project rules live in `.cursor/rules` as `.mdc` files

> Project rules must use the `.mdc` extension. A plain `.md` file in
> `.cursor/rules` is ignored by the rules system

## Nested AGENTS.md

Quoted:

> Cursor supports AGENTS.md in the project root and subdirectories.

> Nested `AGENTS.md` support in subdirectories is now available.

## Size recommendation

Quoted best practice:

> Keep rules under 500 lines

That is a vendor recommendation, not a load failure. `cursor.rule.too-large`
is `info`.

## Staleness risk: HIGH
